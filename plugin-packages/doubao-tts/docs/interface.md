# 豆包语音合成 接口字段

## 协议身份

- 插件 ID：`doubao-tts`。
- Provider ID：`doubao-tts`。
- 能力：`audio`。
- 默认 Base URL：`https://openspeech.bytedance.com`。
- 鉴权驱动：`header`。
- 创建：`POST /api/v3/tts/unidirectional/sse`。
- 生命周期：同步响应。

## 配置字段

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `apiKey` | secret | 是 | API Key |

## 统一字段映射

| 统一字段 | 类型 | 必填 | 上游映射 | 说明 |
| --- | --- | --- | --- | --- |
| `model` | string | 是 | `model` | 音频模型 ID。 |
| `prompt` | string | 是 | `input` | 待合成文本。 |
| `providerOptions` | object | 否 | `provider-specific fields` | 插件命名空间内的厂商扩展字段。 |

## 上游请求模板逐字段清单

下表由插件请求模板生成，覆盖 body、query、headers 和 multipart 文件声明中的每个字段。

| 上游位置 | 值或转换表达式 |
| --- | --- |
| `create.method` | `"POST"` |
| `create.path` | `"/api/v3/tts/unidirectional/sse"` |
| `create.contentType` | `"application/json"` |
| `create.body.user.uid` | `"beeftv"` |
| `create.body.req_params.text` | `{"$ref":"request.prompt"}` |
| `create.body.req_params.speaker` | `{"$ref":"request.providerOptions.doubao-tts.voice"}` |
| `create.body.req_params.sample_rate` | `24000` |
| `create.body.req_params.audio_params.format` | `"mp3"` |
| `create.body.req_params.audio_params.speech_rate` | `{"$toInt":{"$min":[100,{"$max":[-50,{"$multiply":[{"$add":[{"$coalesce":[{"$if":{"condition":{"$ne":[{"$toFloat":{"$ref":"request.extra.audioSpeed"}},0]},"then":{"$toFloat":{"$ref":"request.extra.audioSpeed"}},"else":null}},1]},-1]},100]}]}]}}` |
| `create.headers.X-Api-Resource-Id` | `{"$ref":"request.model"}` |
| `create.headers.X-Api-Request-Id` | `{"$ref":"request.extra.idempotencyKey"}` |

## Provider 扩展键

- `providerOptions.doubao-tts.voice`

动态模型或工作流允许使用文档声明的完整 `parameters/input/extra_body` 对象；该对象是协议本身的开放 schema，不会被宿主裁剪。

## 响应映射逐字段清单

| 映射位置 | 上游路径或转换表达式 |
| --- | --- |
| `response.binaryPayload` | `true` |
| `response.resultKind` | `"audio"` |
| `response.status` | `"succeeded"` |

## 响应与错误

插件把上游 task/status/text/media/usage 映射为统一结果。临时媒体 URL 标记为 ephemeral，由宿主立即下载持久化。HTTP 错误、业务 code 和 error object 保持失败语义，不包装成成功。

## 兼容边界

使用新版语音控制台 API Key；资源 ID 默认 seed-tts-2.0，音色必须与资源匹配。HTTP SSE 音频帧按顺序解码并合并，必须收到完整结束标识。当前输出 MP3、24000Hz。官方文档 https://www.volcengine.com/docs/6561/1598757。

<!-- BEEFTV_PLUGIN_MANIFEST_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "beeftv.plugin/v2",
  "id": "doubao-tts",
  "name": "豆包语音合成",
  "version": "2.0.0",
  "author": "BeefTV Contributors",
  "description": "豆包语音合成 独立请求协议插件。",
  "documentation": "<当前插件的完整 documentation，由 README.md 与 docs/interface.md 拼接而成；为避免 JSON 递归，此处不重复展开正文。>",
  "permissions": [
    "generation.run",
    "media.read"
  ],
  "configuration": {
    "fields": [
      {
        "name": "apiKey",
        "type": "secret",
        "label": "API Key",
        "required": true
      }
    ]
  },
  "contributes": {
    "providers": [
      {
        "id": "doubao-tts",
        "label": "豆包语音合成",
        "capabilities": [
          "audio"
        ],
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "https://openspeech.bytedance.com",
        "requiresPublicMediaUrls": false,
        "auth": {
          "type": "header",
          "field": "apiKey",
          "header": "X-Api-Key"
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model",
            "description": "音频模型 ID。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "input",
            "description": "待合成文本。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": false,
            "mapping": "provider-specific fields",
            "description": "插件命名空间内的厂商扩展字段。"
          }
        ],
        "validations": [
          {
            "assert": {
              "$gt": [
                {
                  "$len": {
                    "$ref": "request.providerOptions.doubao-tts.voice"
                  }
                },
                0
              ]
            },
            "message": "请填写豆包控制台中的音色 ID"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/api/v3/tts/unidirectional/sse",
          "contentType": "application/json",
          "body": {
            "user": {
              "uid": "beeftv"
            },
            "req_params": {
              "text": {
                "$ref": "request.prompt"
              },
              "speaker": {
                "$ref": "request.providerOptions.doubao-tts.voice"
              },
              "sample_rate": 24000,
              "audio_params": {
                "format": "mp3",
                "speech_rate": {
                  "$toInt": {
                    "$min": [
                      100,
                      {
                        "$max": [
                          -50,
                          {
                            "$multiply": [
                              {
                                "$add": [
                                  {
                                    "$coalesce": [
                                      {
                                        "$if": {
                                          "condition": {
                                            "$ne": [
                                              {
                                                "$toFloat": {
                                                  "$ref": "request.extra.audioSpeed"
                                                }
                                              },
                                              0
                                            ]
                                          },
                                          "then": {
                                            "$toFloat": {
                                              "$ref": "request.extra.audioSpeed"
                                            }
                                          },
                                          "else": null
                                        }
                                      },
                                      1
                                    ]
                                  },
                                  -1
                                ]
                              },
                              100
                            ]
                          }
                        ]
                      }
                    ]
                  }
                }
              }
            }
          },
          "headers": {
            "X-Api-Resource-Id": {
              "$ref": "request.model"
            },
            "X-Api-Request-Id": {
              "$ref": "request.extra.idempotencyKey"
            }
          },
          "audioStream": {
            "transport": "http-sse",
            "audioPath": "data",
            "codePath": "code",
            "donePath": "code",
            "doneValue": 20000000
          }
        },
        "response": {
          "binaryPayload": true,
          "resultKind": "audio",
          "status": "succeeded"
        }
      }
    ]
  }
}
```
<!-- BEEFTV_PLUGIN_MANIFEST_END -->
