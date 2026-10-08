package transcription

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"infinite-canvas/backend/internal/localcrypto"
	"infinite-canvas/backend/internal/outbound"
)

type Settings struct {
	Revision       int    `json:"revision"`
	DefaultRoute   string `json:"defaultRoute"`
	Language       string `json:"language"`
	ServiceEnabled bool   `json:"serviceEnabled"`
	ServiceType    string `json:"serviceType"`
	BaseURL        string `json:"baseUrl"`
	Model          string `json:"model"`
	APIKey         string `json:"apiKey"`
	HasAPIKey      bool   `json:"hasApiKey"`
}

var settingsMu sync.Mutex

func ReadSettings(dataDir string) (Settings, error) {
	settingsMu.Lock()
	defer settingsMu.Unlock()
	return readSettings(dataDir)
}

func readSettings(dataDir string) (Settings, error) {
	settings := Settings{DefaultRoute: "auto", Language: "", ServiceType: "openai", BaseURL: strings.TrimSpace(os.Getenv(BaseURLEnv)), ServiceEnabled: strings.TrimSpace(os.Getenv(BaseURLEnv)) != "", Model: "whisper-1"}
	if settings.ServiceEnabled {
		settings.ServiceType = "whisper"
	}
	raw, err := os.ReadFile(filepath.Join(dataDir, "asr-settings.json"))
	if errors.Is(err, os.ErrNotExist) {
		return settings, nil
	}
	if err != nil {
		return Settings{}, err
	}
	var envelope struct {
		Encrypted string `json:"encryptedSettings"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return Settings{}, fmt.Errorf("ASR 配置读取失败")
	}
	plain, err := localcrypto.Decrypt(dataDir, envelope.Encrypted)
	if err != nil {
		return Settings{}, err
	}
	if err := json.Unmarshal([]byte(plain), &settings); err != nil {
		return Settings{}, fmt.Errorf("ASR 配置格式错误")
	}
	return settings, nil
}

func PublicSettings(settings Settings) Settings {
	settings.HasAPIKey = settings.APIKey != ""
	settings.APIKey = ""
	return settings
}

func SaveSettings(dataDir string, next Settings) (Settings, error) {
	settingsMu.Lock()
	defer settingsMu.Unlock()
	current, err := readSettings(dataDir)
	if err != nil {
		return Settings{}, err
	}
	if current.Revision != next.Revision {
		return Settings{}, fmt.Errorf("ASR 配置已更新，请刷新后重试")
	}
	if next.DefaultRoute != "auto" && next.DefaultRoute != "local" && next.DefaultRoute != "service" {
		return Settings{}, fmt.Errorf("请选择自动、本地或在线识别")
	}
	if next.ServiceType != "whisper" && next.ServiceType != "openai" {
		return Settings{}, fmt.Errorf("不支持该 ASR 接口类型")
	}
	next.BaseURL = strings.TrimRight(strings.TrimSpace(next.BaseURL), "/")
	next.Model = strings.TrimSpace(next.Model)
	next.Language = strings.TrimSpace(next.Language)
	if next.Language != "" && next.Language != "zh" && next.Language != "en" && next.Language != "ja" && next.Language != "ko" {
		return Settings{}, fmt.Errorf("请选择支持的识别语言")
	}
	if strings.TrimSpace(next.APIKey) == "" && next.HasAPIKey {
		next.APIKey = current.APIKey
	} else {
		next.APIKey = strings.TrimSpace(next.APIKey)
	}
	next.HasAPIKey = false
	if next.ServiceEnabled || next.DefaultRoute == "service" {
		if !next.ServiceEnabled {
			return Settings{}, fmt.Errorf("请先启用在线识别服务")
		}
		if err := validateServiceURL(next); err != nil {
			return Settings{}, err
		}
		if next.ServiceType == "openai" && (next.Model == "" || next.APIKey == "") {
			return Settings{}, fmt.Errorf("请填写转写模型和 API Key")
		}
	}
	next.Revision++
	raw, err := json.Marshal(next)
	if err != nil {
		return Settings{}, err
	}
	encrypted, err := localcrypto.Encrypt(dataDir, string(raw))
	if err != nil {
		return Settings{}, err
	}
	encoded, _ := json.Marshal(map[string]string{"encryptedSettings": encrypted})
	temporary, err := os.CreateTemp(dataDir, ".asr-settings-*")
	if err != nil {
		return Settings{}, err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0600); err != nil {
		temporary.Close()
		return Settings{}, err
	}
	if _, err := temporary.Write(encoded); err != nil {
		temporary.Close()
		return Settings{}, err
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return Settings{}, err
	}
	if err := temporary.Close(); err != nil {
		return Settings{}, err
	}
	if err := os.Rename(temporaryPath, filepath.Join(dataDir, "asr-settings.json")); err != nil {
		return Settings{}, err
	}
	return PublicSettings(next), nil
}

func validateServiceURL(settings Settings) error {
	parsed, err := url.Parse(settings.BaseURL)
	if err != nil || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.Scheme != "http" && parsed.Scheme != "https" {
		return fmt.Errorf("请填写完整的 HTTP(S) 服务基础地址，不包含账号或查询参数")
	}
	// whisper.cpp's existing local HTTP service is an explicit loopback tool.
	if settings.ServiceType == "whisper" && (parsed.Hostname() == "localhost" || parsed.Hostname() == "127.0.0.1" || parsed.Hostname() == "::1") {
		return nil
	}
	if _, err := outbound.ValidateCustomRelayURL(settings.BaseURL); err != nil {
		return fmt.Errorf("在线 ASR 地址需要可访问的 HTTPS 服务")
	}
	return nil
}

type SettingsStatus struct {
	RuntimeStatus
	Settings Settings `json:"settings"`
}

func StatusFor(dataDir string) (SettingsStatus, error) {
	settings, err := ReadSettings(dataDir)
	if err != nil {
		return SettingsStatus{}, err
	}
	status := Status()
	status.ServiceReady = settings.ServiceEnabled && settings.BaseURL != "" && (settings.ServiceType != "openai" || settings.APIKey != "" && settings.Model != "")
	status.DefaultRoute = settings.DefaultRoute
	if status.DefaultRoute == "auto" {
		status.DefaultRoute = ""
		if status.LocalReady {
			status.DefaultRoute = "local"
		} else if status.ServiceReady {
			status.DefaultRoute = "service"
		}
	}
	return SettingsStatus{RuntimeStatus: status, Settings: PublicSettings(settings)}, nil
}

func ResolveConfiguredRoute(dataDir, route string) (string, string, Settings, error) {
	settings, err := ReadSettings(dataDir)
	if err != nil {
		return "", "", Settings{}, err
	}
	if route == "" || route == "auto" {
		route = settings.DefaultRoute
		if route == "auto" {
			if LocalAvailable() {
				route = "local"
			} else {
				route = "service"
			}
		}
	}
	identity := ""
	if route == "local" {
		_, key, err := ResolveRoute("local")
		if err != nil {
			return "", "", settings, err
		}
		return route, key, settings, nil
	} else if route == "service" {
		if !settings.ServiceEnabled || settings.BaseURL == "" {
			return "", "", settings, fmt.Errorf("请在 ASR 页配置并启用在线识别服务")
		}
		if err := validateServiceURL(settings); err != nil {
			return "", "", settings, err
		}
		if settings.ServiceType == "openai" && (settings.APIKey == "" || settings.Model == "") {
			return "", "", settings, fmt.Errorf("请填写转写模型和 API Key")
		}
		identity = settings.ServiceType + "\x00" + settings.BaseURL + "\x00" + settings.Model + "\x00" + settings.APIKey
	} else {
		return "", "", settings, fmt.Errorf("请选择本地或在线识别")
	}
	hash := sha256.Sum256([]byte(route + "\x00" + identity))
	return route, hex.EncodeToString(hash[:]), settings, nil
}

func ConfiguredClient(route string, settings Settings) *Client {
	if route == "local" {
		return NewClient("")
	}
	client := NewClient(settings.BaseURL)
	client.APIKey, client.Model = settings.APIKey, settings.Model
	parsed, _ := url.Parse(settings.BaseURL)
	if parsed == nil || settings.ServiceType != "whisper" || (parsed.Hostname() != "localhost" && parsed.Hostname() != "127.0.0.1" && parsed.Hostname() != "::1") {
		client.HTTP = outbound.CustomRelayHTTPClient(20 * time.Minute)
	}
	if settings.ServiceType == "openai" {
		client.Endpoint = "/audio/transcriptions"
	}
	client.HTTP.CheckRedirect = func(_ *http.Request, _ []*http.Request) error { return fmt.Errorf("转写服务不允许重定向") }
	return client
}
