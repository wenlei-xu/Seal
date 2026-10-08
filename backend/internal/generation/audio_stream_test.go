package generation

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"github.com/gorilla/websocket"
	"infinite-canvas/backend/internal/outbound"
	"infinite-canvas/backend/internal/protocol"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSpeechNativeManifestContractsAndAudioFrames(t *testing.T) {
	for _, id := range []string{"doubao-tts", "xfyun-tts"} {
		raw, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", id, "manifest.json"))
		if err != nil {
			t.Fatal(err)
		}
		adapter, err := protocol.LoadManifest(raw)
		if err != nil {
			t.Fatal(err)
		}
		request := protocol.GenerationRequest{Model: "seed-tts-2.0", Prompt: "你好", Extra: map[string]any{"audioSpeed": "1.25", "idempotencyKey": "test-id"}, ProviderOptions: map[string]map[string]any{id: {"voice": "test-voice", "appId": "test-app"}}}
		spec, err := adapter.BuildCreate(context.Background(), protocol.RequestContext{Request: request})
		if err != nil {
			t.Fatal(err)
		}
		if spec.AudioStream == nil {
			t.Fatal("missing native stream contract")
		}
		body, _ := json.Marshal(spec.Body)
		if id == "doubao-tts" {
			if spec.Headers["X-Api-Resource-Id"] != "seed-tts-2.0" || !strings.Contains(string(body), `"speech_rate":25`) {
				t.Fatal("wrong Doubao resource/speed")
			}
		} else {
			if !strings.Contains(string(body), base64.StdEncoding.EncodeToString([]byte("你好"))) || spec.Auth.Type != "xfyun-ws" {
				t.Fatal("wrong Xunfei text/auth")
			}
			request.Prompt = strings.Repeat("中", 2667)
			if _, err := adapter.BuildCreate(context.Background(), protocol.RequestContext{Request: request}); err == nil {
				t.Fatal("overlong UTF8 text accepted")
			}
		}
		collector := audioFrameCollector{spec: *spec.AudioStream}
		var frames []string
		if id == "doubao-tts" {
			frames = []string{`{"code":0,"data":"SUQz"}`, `{"code":0,"data":"AQI="}`, `{"code":20000000}`}
		} else {
			frames = []string{`{"code":0,"data":{"status":1,"audio":"SUQz"}}`, `{"code":0,"data":{"status":2,"audio":"AQI="}}`}
		}
		for _, frame := range frames {
			if err := collector.add([]byte(frame)); err != nil {
				t.Fatal(err)
			}
		}
		data, _, err := collector.result()
		if err != nil || string(data) != "ID3\x01\x02" {
			t.Fatal("audio frames not ordered", err)
		}
	}
	incomplete := audioFrameCollector{spec: protocol.AudioStreamSpec{AudioPath: "data", CodePath: "code", DonePath: "code", DoneValue: 20000000}}
	if err := incomplete.add([]byte(`{"code":0,"data":"SUQz"}`)); err != nil {
		t.Fatal(err)
	}
	if _, _, err := incomplete.result(); err == nil {
		t.Fatal("partial audio accepted")
	}
	if err := incomplete.add([]byte(`{"code":45000000,"data":"SUQz"}`)); err == nil {
		t.Fatal("business failure accepted")
	}
}

func TestSpeechSSEUsesHostTransportAndNativeAuthentication(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Api-Key") != "test-key" || r.Header.Get("Accept") != "text/event-stream" {
			t.Error("wrong native headers")
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Write([]byte("data: {\"code\":0,\"data\":\"SUQz\"}\n\ndata: {\"code\":20000000}\n\n"))
	}))
	defer server.Close()
	spec := protocol.RequestSpec{Method: "POST", Path: "/api/v3/tts/unidirectional/sse", ContentType: "application/json", Body: map[string]any{"text": "hello"}, Auth: protocol.ManifestAuth{Type: "header", Field: "apiKey", Header: "X-Api-Key"}, AudioStream: &protocol.AudioStreamSpec{Transport: "http-sse", AudioPath: "data", CodePath: "code", DonePath: "code", DoneValue: 20000000}}
	data, _, err := ExecuteProtocolBinaryRequest(context.Background(), Config{BaseURL: server.URL, APIKey: "test-key"}, spec)
	if err != nil || string(data) != "ID3" {
		t.Fatal("SSE audio execution failed", err)
	}
	req, _ := http.NewRequest("POST", "https://tts-api.xfyun.cn/v2/tts", nil)
	if err := ApplyProtocolAuth(req, Config{APIKey: "test-key", SecretKey: "test-secret"}, protocol.ManifestAuth{Type: "xfyun-ws", Field: "apiKey", SecretField: "secretKey"}); err != nil {
		t.Fatal(err)
	}
	decoded, err := base64.StdEncoding.DecodeString(req.URL.Query().Get("authorization"))
	if err != nil || !strings.Contains(string(decoded), `headers="host date request-line"`) || strings.Contains(req.URL.String(), "test-secret") {
		t.Fatal("invalid signed WS authentication", err)
	}
}

func TestSpeechWebsocketCompletesThroughGuardedTransport(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	upgrader := websocket.Upgrader{}
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("authorization") == "" || r.URL.Path != "/v2/tts" {
			t.Error("missing signed native handshake")
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Error(err)
			return
		}
		defer conn.Close()
		_, payload, err := conn.ReadMessage()
		if err != nil {
			t.Error(err)
			return
		}
		if !strings.Contains(string(payload), `"app_id":"test-app"`) {
			t.Error("wrong application payload")
		}
		conn.WriteMessage(websocket.TextMessage, []byte(`{"code":0,"data":{"status":1,"audio":"SUQz"}}`))
		conn.WriteMessage(websocket.TextMessage, []byte(`{"code":0,"data":{"status":2,"audio":"AQI="}}`))
	}))
	defer server.Close()
	// Trust only this test certificate; production TLS verification is unchanged.
	guarded := outbound.CustomRelayHTTPClient(HTTPTimeout).Transport.(*http.Transport)
	originalTLS := guarded.TLSClientConfig
	guarded.TLSClientConfig = server.Client().Transport.(*http.Transport).TLSClientConfig
	defer func() { guarded.TLSClientConfig = originalTLS }()
	spec := protocol.RequestSpec{Method: "POST", Path: "/v2/tts", ContentType: "application/json", Body: map[string]any{"common": map[string]any{"app_id": "test-app"}}, Auth: protocol.ManifestAuth{Type: "xfyun-ws", Field: "apiKey", SecretField: "secretKey"}, AudioStream: &protocol.AudioStreamSpec{Transport: "websocket", AudioPath: "data.audio", CodePath: "code", DonePath: "data.status", DoneValue: 2}}
	data, _, err := ExecuteProtocolBinaryRequest(context.Background(), Config{BaseURL: server.URL, APIKey: "test-key", SecretKey: "test-secret"}, spec)
	if err != nil || string(data) != "ID3\x01\x02" {
		t.Fatal("native websocket audio failed", err)
	}
}
