package transcription

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

const LocalCLIEnv = "BEEFTV_WHISPER_CLI"
const LocalModelEnv = "BEEFTV_WHISPER_MODEL"

func localPaths() (string, string) {
	cli, model := strings.TrimSpace(os.Getenv(LocalCLIEnv)), strings.TrimSpace(os.Getenv(LocalModelEnv))
	entry := strings.TrimSpace(os.Getenv("BEEFTV_EDIT_HOST_ENTRY"))
	root := ""
	if entry != "" {
		root = filepath.Join(filepath.Dir(entry), "media", "asr")
	} else if executable, err := os.Executable(); err == nil {
		root = filepath.Join(filepath.Dir(executable), "edit-host", "media", "asr")
	}
	if cli == "" {
		name := "whisper-cli"
		if runtime.GOOS == "windows" {
			name += ".exe"
		}
		cli = filepath.Join(root, "bin", name)
	}
	if model == "" {
		model = filepath.Join(root, "models", "ggml-base.bin")
	}
	return cli, model
}

func LocalAvailable() bool {
	cli, model := localPaths()
	for _, file := range []string{cli, model} {
		if !filepath.IsAbs(file) {
			return false
		}
		info, err := os.Stat(file)
		if err != nil || !info.Mode().IsRegular() || info.Size() == 0 {
			return false
		}
	}
	return true
}

// Native tools receive only runtime/media settings, never configured model keys.
func localEnvironment() []string {
	allowed := map[string]bool{"PATH": true, "PATHEXT": true, "SYSTEMROOT": true, "WINDIR": true, "TEMP": true, "TMP": true, "USERPROFILE": true, "HOME": true, "LOCALAPPDATA": true, "APPDATA": true}
	out := []string{}
	for _, value := range os.Environ() {
		parts := strings.SplitN(value, "=", 2)
		if allowed[strings.ToUpper(parts[0])] {
			out = append(out, value)
		}
	}
	return out
}

type tailWriter struct{ bytes []byte }

func (w *tailWriter) Write(value []byte) (int, error) {
	w.bytes = append(w.bytes, value...)
	if len(w.bytes) > 8192 {
		w.bytes = append([]byte(nil), w.bytes[len(w.bytes)-8192:]...)
	}
	return len(value), nil
}

func transcribeLocal(ctx context.Context, wavPath, language string) ([]Segment, string, error) {
	if !LocalAvailable() {
		return nil, "", fmt.Errorf("本地识别模型未安装；请准备 Whisper Base 运行包，或设置 %s 连接已有服务", BaseURLEnv)
	}
	if language == "" {
		language = "auto"
	}
	if !regexp.MustCompile(`^[a-z]{2,3}$|^auto$`).MatchString(language) {
		return nil, "", fmt.Errorf("语音识别语言无效")
	}
	cli, model := localPaths()
	output := filepath.Join(filepath.Dir(wavPath), "recognition")
	ctx, cancel := context.WithTimeout(ctx, 20*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, cli, "-m", model, "-f", wavPath, "-l", language, "-ojf", "-dtw", "base", "-ng", "-t", "4", "-of", output)
	cmd.Env = localEnvironment()
	hideWindow(cmd)
	cmd.Dir = filepath.Dir(wavPath)
	log := &tailWriter{}
	cmd.Stdout = log
	cmd.Stderr = log
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return nil, "", ctx.Err()
		}
		return nil, "", fmt.Errorf("本地语音识别失败：%s", strings.TrimSpace(string(log.bytes)))
	}
	file, err := os.Open(output + ".json")
	if err != nil {
		return nil, "", fmt.Errorf("本地识别结果未保存：%w", err)
	}
	defer file.Close()
	bytes, err := io.ReadAll(io.LimitReader(file, 8<<20+1))
	if err != nil || len(bytes) > 8<<20 {
		return nil, "", fmt.Errorf("本地识别结果过大或无法读取")
	}
	segments, detected, err := DecodeLocalJSON(bytes)
	if err != nil {
		return nil, "", err
	}
	if len(segments) == 0 {
		return nil, "", fmt.Errorf("本地识别未发现语音内容")
	}
	return segments, detected, nil
}

// Token timestamps are approximate model alignment, not verified word boundaries.
func DecodeLocalJSON(bytes []byte) ([]Segment, string, error) {
	type offsets struct {
		From int64 `json:"from"`
		To   int64 `json:"to"`
	}
	var payload struct {
		Result struct {
			Language string `json:"language"`
		} `json:"result"`
		Transcription []struct {
			Text    string  `json:"text"`
			Offsets offsets `json:"offsets"`
			Tokens  []struct {
				Text        string  `json:"text"`
				Offsets     offsets `json:"offsets"`
				Probability float64 `json:"p"`
			} `json:"tokens"`
		} `json:"transcription"`
	}
	if err := json.Unmarshal(bytes, &payload); err != nil {
		return nil, "", fmt.Errorf("本地识别结果无法解析：%w", err)
	}
	segments := []Segment{}
	for _, item := range payload.Transcription {
		text := strings.TrimSpace(item.Text)
		if text == "" {
			continue
		}
		if item.Offsets.From < 0 || item.Offsets.To <= item.Offsets.From {
			return nil, "", fmt.Errorf("本地识别返回无效时间戳")
		}
		segment := Segment{StartMs: item.Offsets.From, EndMs: item.Offsets.To, Text: text}
		for _, token := range item.Tokens {
			if strings.TrimSpace(token.Text) == "" || strings.HasPrefix(token.Text, "[_") || token.Offsets.To <= token.Offsets.From || token.Offsets.From < segment.StartMs || token.Offsets.To > segment.EndMs {
				continue
			}
			segment.Tokens = append(segment.Tokens, Token{StartMs: token.Offsets.From, EndMs: token.Offsets.To, Text: token.Text, Probability: token.Probability})
		}
		segments = append(segments, segment)
	}
	return segments, payload.Result.Language, nil
}
