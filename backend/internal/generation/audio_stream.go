package generation

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"infinite-canvas/backend/internal/outbound"
	"infinite-canvas/backend/internal/protocol"
)

type audioFrameCollector struct {
	spec  protocol.AudioStreamSpec
	audio bytes.Buffer
	done  bool
	limit int64
}

func audioFramePath(frame map[string]any, path string) any {
	var value any = frame
	for _, key := range strings.Split(path, ".") {
		object, ok := value.(map[string]any)
		if !ok {
			return nil
		}
		value = object[key]
	}
	return value
}

func (c *audioFrameCollector) add(frame []byte) error {
	var payload map[string]any
	if err := json.Unmarshal(frame, &payload); err != nil {
		return fmt.Errorf("语音服务返回了无效音频帧")
	}
	code, ok := audioFramePath(payload, c.spec.CodePath).(float64)
	if !ok {
		return fmt.Errorf("语音服务未返回状态码")
	}
	doneValue, hasDone := audioFramePath(payload, c.spec.DonePath).(float64)
	isDone := hasDone && doneValue == float64(c.spec.DoneValue)
	if code != 0 && !(c.spec.DonePath == c.spec.CodePath && isDone) {
		return fmt.Errorf("语音合成失败（上游状态码 %.0f），请检查凭证、服务权限与音色", code)
	}
	if data, ok := audioFramePath(payload, c.spec.AudioPath).(string); ok && data != "" {
		decoded, err := base64.StdEncoding.DecodeString(data)
		if err != nil {
			return fmt.Errorf("语音服务返回了无效音频编码")
		}
		limit := c.limit
		if limit <= 0 {
			limit = MaxResponseBytes
		}
		if int64(c.audio.Len()+len(decoded)) > limit {
			return fmt.Errorf("语音合成结果超过大小限制")
		}
		c.audio.Write(decoded)
	}
	c.done = isDone
	return nil
}

func (c *audioFrameCollector) result() ([]byte, string, error) {
	if !c.done {
		return nil, "", fmt.Errorf("语音合成连接提前结束，未返回完整音频")
	}
	if c.audio.Len() == 0 {
		return nil, "", fmt.Errorf("语音服务未返回音频")
	}
	return c.audio.Bytes(), "audio/mpeg", nil
}

func executeAudioStream(req *http.Request, config Config, spec protocol.AudioStreamSpec) ([]byte, string, error) {
	collector := &audioFrameCollector{spec: spec}
	switch spec.Transport {
	case "http-sse":
		req.Header.Set("Accept", "text/event-stream")
		data, _, err := DoBinary(req)
		if err != nil {
			return nil, "", err
		}
		scanner := bufio.NewScanner(bytes.NewReader(data))
		scanner.Buffer(make([]byte, 4096), int(MaxResponseBytes))
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if strings.HasPrefix(line, "data:") {
				line = strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			} else {
				continue
			}
			if line == "" {
				continue
			}
			if err := collector.add([]byte(line)); err != nil {
				return nil, "", err
			}
			if collector.done {
				break
			}
		}
		if err := scanner.Err(); err != nil {
			return nil, "", fmt.Errorf("语音数据帧超过大小限制")
		}
		return collector.result()
	case "websocket":
		return executeWebsocketAudio(req, config, collector)
	default:
		return nil, "", fmt.Errorf("不支持该音频流传输方式")
	}
}

func executeWebsocketAudio(req *http.Request, config Config, collector *audioFrameCollector) (data []byte, mime string, resultErr error) {
	if _, err := outbound.ValidateCustomRelayURL(req.URL.String()); err != nil {
		return nil, "", err
	}
	if req.URL.Scheme != "https" {
		return nil, "", fmt.Errorf("语音 WebSocket 仅支持 HTTPS/WSS 服务")
	}
	if req.Body == nil {
		return nil, "", fmt.Errorf("语音请求缺少文本与配置")
	}
	defer req.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(req.Body, 1<<20+1))
	if err != nil || len(payload) > 1<<20 {
		return nil, "", fmt.Errorf("语音合成文本过长")
	}
	ctx, cancel := context.WithTimeout(req.Context(), HTTPTimeout)
	defer cancel()
	runtime, hasRuntime := RuntimeFromContext(ctx)
	if hasRuntime && runtime.Limits != nil {
		limit, err := runtime.Limits.GeneratedFileBytes(ctx)
		if err != nil {
			return nil, "", err
		}
		collector.limit = limit
		open, err := runtime.Limits.CircuitOpen(ctx, config.ChannelID)
		if err != nil {
			return nil, "", err
		}
		if open {
			return nil, "", CircuitOpenError{}
		}
		slot := config.ChannelID
		if slot == "" {
			slot = "custom:" + req.URL.Host
		}
		release, _, err := runtime.Limits.AcquireChannelSlot(ctx, config.ChannelID, slot, HTTPTimeout+time.Minute)
		if err != nil {
			return nil, "", err
		}
		defer release()
		defer func() {
			_ = runtime.Limits.RecordChannelResult(ctx, config.ChannelID, resultErr != nil && ctx.Err() == nil)
		}()
	}
	// Signed WebSocket query strings remain in memory and never enter receipts.
	auditReq := req.Clone(ctx)
	auditURL := *req.URL
	auditURL.RawQuery = ""
	auditReq.URL = &auditURL
	responseLimit := collector.limit
	if responseLimit <= 0 {
		responseLimit = MaxResponseBytes
	}
	observation := TransportObservation{Request: auditReq, StartedAt: time.Now(), ResponseLimitBytes: responseLimit}
	defer func() {
		observation.Body = data
		observation.Err = resultErr
		if hasRuntime && runtime.Receipts != nil {
			runtime.Receipts.Observe(observation)
		}
	}()
	guarded := outbound.CustomRelayHTTPClient(HTTPTimeout).Transport.(*http.Transport)
	dialer := websocket.Dialer{NetDialContext: guarded.DialContext, TLSClientConfig: guarded.TLSClientConfig, HandshakeTimeout: 30 * time.Second}
	target := *req.URL
	target.Scheme = "wss"
	observation.Dispatched = true
	conn, resp, err := dialer.DialContext(ctx, target.String(), req.Header)
	if resp != nil {
		observation.HTTPStatus = resp.StatusCode
		observation.StatusCode = resp.StatusCode
		if resp.Body != nil {
			resp.Body.Close()
		}
	}
	if err != nil {
		if ctx.Err() != nil {
			return nil, "", ctx.Err()
		}
		return nil, "", fmt.Errorf("语音服务连接失败，请检查凭证与网络")
	}
	defer conn.Close()
	stop := context.AfterFunc(ctx, func() { conn.Close() })
	defer stop()
	conn.SetReadLimit(responseLimit)
	if deadline, ok := ctx.Deadline(); ok {
		conn.SetReadDeadline(deadline)
		conn.SetWriteDeadline(deadline)
	}
	if err := conn.WriteMessage(websocket.TextMessage, payload); err != nil {
		return nil, "", fmt.Errorf("发送语音合成文本失败")
	}
	var total int64
	for !collector.done {
		kind, frame, err := conn.ReadMessage()
		if err != nil {
			if ctx.Err() != nil {
				return nil, "", ctx.Err()
			}
			return nil, "", fmt.Errorf("语音合成连接中断，未返回完整音频")
		}
		total += int64(len(frame))
		if total > responseLimit {
			return nil, "", fmt.Errorf("语音响应超过大小限制")
		}
		if kind != websocket.TextMessage {
			return nil, "", fmt.Errorf("语音服务返回了不支持的消息格式")
		}
		if err := collector.add(frame); err != nil {
			return nil, "", err
		}
	}
	return collector.result()
}
