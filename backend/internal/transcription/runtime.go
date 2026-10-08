package transcription

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"strings"
)

type RuntimeStatus struct {
	LocalReady   bool   `json:"localReady"`
	ServiceReady bool   `json:"serviceReady"`
	DefaultRoute string `json:"defaultRoute"`
	Model        string `json:"model"`
	ModelBytes   int64  `json:"modelBytes"`
	TimingLevel  string `json:"timingLevel"`
}

func Status() RuntimeStatus {
	status := RuntimeStatus{LocalReady: LocalAvailable(), ServiceReady: strings.TrimSpace(os.Getenv(BaseURLEnv)) != "", Model: "Whisper Base · 多语言", TimingLevel: "token"}
	_, model := localPaths()
	if info, err := os.Stat(model); err == nil && info.Mode().IsRegular() {
		status.ModelBytes = info.Size()
	}
	if status.LocalReady {
		status.DefaultRoute = "local"
	} else if status.ServiceReady {
		status.DefaultRoute = "service"
	}
	return status
}

// Persist only an opaque identity, never the service URL or runtime paths.
// A changed runtime must not silently reuse a previous transcript or queued job.
func ResolveRoute(route string) (string, string, error) {
	if route == "" {
		route = Status().DefaultRoute
	}
	identity := ""
	switch route {
	case "local":
		if !LocalAvailable() {
			return "", "", fmt.Errorf("本地 Whisper Base 运行包未就绪")
		}
		cli, model := localPaths()
		for _, file := range []string{cli, model} {
			info, err := os.Stat(file)
			if err != nil {
				return "", "", err
			}
			identity += fmt.Sprintf("%s\x00%d\x00%d\x00", file, info.Size(), info.ModTime().UnixNano())
		}
	case "service":
		identity = strings.TrimSpace(os.Getenv(BaseURLEnv))
		if identity == "" {
			return "", "", fmt.Errorf("未配置已有转写服务：%s", BaseURLEnv)
		}
	default:
		return "", "", fmt.Errorf("请选择本地模型或已有转写服务")
	}
	hash := sha256.Sum256([]byte(route + "\x00" + identity))
	return route, hex.EncodeToString(hash[:]), nil
}
