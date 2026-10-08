// Package editruntime owns the local HyperFrames host process and its private control channel.
package editruntime

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	httptransport "infinite-canvas/backend/internal/transport/http"
)

type Host struct {
	mu       sync.Mutex
	dataDir  string
	cmd      *exec.Cmd
	stdin    io.WriteCloser
	endpoint string
	token    string
	done     chan error
}

func New(dataDir string) *Host { return &Host{dataDir: dataDir} }

// Checking an unopened editor must not start its child process.
func (h *Host) CheckUpdateReady(ctx context.Context) error {
	h.mu.Lock()
	endpoint, token, done := h.endpoint, h.token, h.done
	h.mu.Unlock()
	if endpoint == "" || done == nil {
		return nil
	}
	select {
	case <-done:
		return nil
	default:
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint+"/update/status", nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-Beeftv-Edit-Host", token)
	client := &http.Client{Timeout: 5 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := client.Do(req)
	if err != nil {
		return errors.New("无法确认剪辑运行端状态，请稍后再更新")
	}
	defer response.Body.Close()
	var state struct {
		Ready bool `json:"ready"`
	}
	if response.StatusCode != http.StatusOK || json.NewDecoder(io.LimitReader(response.Body, 4096)).Decode(&state) != nil {
		return errors.New("无法确认剪辑运行端状态，请重新打开软件后再更新")
	}
	if !state.Ready {
		return errors.New("剪辑仍在保存、制作或导出，请等待完成后再更新")
	}
	return nil
}

func command() (string, string, error) {
	entry := strings.TrimSpace(os.Getenv("BEEFTV_EDIT_HOST_ENTRY"))
	if entry == "" {
		executable, _ := os.Executable()
		candidates := []string{filepath.Join(filepath.Dir(executable), "edit-host", "server.mjs"), filepath.Join(filepath.Dir(executable), "..", "Resources", "edit-host", "server.mjs")}
		cwd, _ := os.Getwd()
		for dir := cwd; dir != filepath.Dir(dir); dir = filepath.Dir(dir) {
			candidates = append(candidates, filepath.Join(dir, "edit-host", "server.mjs"))
		}
		for _, candidate := range candidates {
			if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
				entry = candidate
				break
			}
		}
	}
	if entry == "" {
		return "", "", errors.New("HyperFrames 编辑运行端未安装")
	}
	entry, err := filepath.Abs(entry)
	if err != nil {
		return "", "", err
	}
	node := strings.TrimSpace(os.Getenv("BEEFTV_EDIT_NODE"))
	if node == "" {
		for _, candidate := range []string{filepath.Join(filepath.Dir(entry), "runtime", "node.exe"), filepath.Join(filepath.Dir(entry), "runtime", "bin", "node"), filepath.Join(filepath.Dir(entry), "..", "agent-host", "runtime", "node.exe")} {
			if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
				node = candidate
				break
			}
		}
	}
	if node == "" {
		node, err = exec.LookPath("node")
	}
	return node, entry, err
}

func (h *Host) ensure(ctx context.Context) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.cmd != nil {
		select {
		case <-h.done:
			h.cmd = nil
			h.endpoint = ""
		default:
			return nil
		}
	}
	node, entry, err := command()
	if err != nil {
		return err
	}
	token, err := httptransport.NewLaunchToken()
	if err != nil {
		return err
	}
	cmd := exec.Command(node, entry)
	hideWindow(cmd)
	cmd.Dir = filepath.Dir(entry)
	cmd.Env = append(os.Environ(), "BEEFTV_EDIT_DATA_DIR="+filepath.Join(h.dataDir, "edits"), "BEEFTV_EDIT_HOST_TOKEN="+token, "BEEFTV_EDIT_LIFETIME_STDIN=1", "HYPERFRAMES_TELEMETRY_DISABLED=1")
	cmd.Stderr = os.Stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait(); close(done) }()
	ready := make(chan string, 1)
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			var value struct {
				Endpoint string `json:"endpoint"`
			}
			if json.Unmarshal(scanner.Bytes(), &value) == nil && strings.HasPrefix(value.Endpoint, "http://127.0.0.1:") {
				select {
				case ready <- value.Endpoint:
				default:
				}
			}
		}
	}()
	select {
	case endpoint := <-ready:
		h.cmd, h.stdin, h.endpoint, h.token, h.done = cmd, stdin, endpoint, token, done
		return nil
	case <-done:
		return errors.New("编辑运行端启动失败，请检查依赖安装")
	case <-ctx.Done():
		_ = stdin.Close()
		_ = cmd.Process.Kill()
		<-done
		return ctx.Err()
	case <-time.After(35 * time.Second):
		_ = stdin.Close()
		_ = cmd.Process.Kill()
		<-done
		return errors.New("编辑运行端启动超时")
	}
}

func (h *Host) Call(ctx context.Context, method, route string, body []byte) (json.RawMessage, int, error) {
	if err := h.ensure(ctx); err != nil {
		return nil, 503, err
	}
	h.mu.Lock()
	endpoint, token := h.endpoint, h.token
	h.mu.Unlock()
	req, err := http.NewRequestWithContext(ctx, method, endpoint+route, bytes.NewReader(body))
	if err != nil {
		return nil, 500, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Beeftv-Edit-Host", token)
	client := &http.Client{Timeout: 2 * time.Minute, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := client.Do(req)
	if err != nil {
		return nil, 503, err
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if err != nil {
		return nil, 503, err
	}
	if !json.Valid(data) {
		return nil, 502, fmt.Errorf("编辑运行端返回无效响应")
	}
	return data, response.StatusCode, nil
}

// OpenStream is for owned media, not browser-supplied URLs or filesystem paths.
func (h *Host) OpenStream(ctx context.Context, method, route string, body io.Reader, metadata []byte) (*http.Response, error) {
	if err := h.ensure(ctx); err != nil {
		return nil, err
	}
	h.mu.Lock()
	endpoint, token := h.endpoint, h.token
	h.mu.Unlock()
	req, err := http.NewRequestWithContext(ctx, method, endpoint+route, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Beeftv-Edit-Host", token)
	if metadata != nil {
		req.Header.Set("Content-Type", "application/octet-stream")
		req.Header.Set("X-Beeftv-Media-Metadata", base64.StdEncoding.EncodeToString(metadata))
	}
	client := &http.Client{Timeout: 5 * time.Minute, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	return client.Do(req)
}

func (h *Host) Close(ctx context.Context) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.cmd == nil {
		return nil
	}
	_ = h.stdin.Close()
	select {
	case <-h.done:
	case <-ctx.Done():
		_ = h.cmd.Process.Kill()
		<-h.done
	}
	h.cmd = nil
	h.endpoint = ""
	return nil
}
