# 科大讯飞在线语音合成 接口字段

## 协议身份

- 插件 ID：`xfyun-tts`。
- Provider ID：`xfyun-tts`。
- 能力：`audio`。
- 默认 Base URL：`https://tts-api.xfyun.cn`。
- 鉴权驱动：`xfyun-ws`。
- 创建：`POST /v2/tts`。
- 生命周期：同步响应。

## 配置字段

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `apiKey` | secret | 是 | API Key |
| `secretKey` | secret | 是 | API Secret |

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
| `create.path` | `"/v2/tts"` |
| `create.contentType` | `"application/json"` |
| `create.body.common.app_id` | `{"$ref":"request.providerOptions.xfyun-tts.appId"}` |
| `create.body.business.aue` | `"lame"` |
| `create.body.business.sfl` | `1` |
| `create.body.business.auf` | `"audio/L16;rate=16000"` |
| `create.body.business.vcn` | `{"$ref":"request.providerOptions.xfyun-tts.voice"}` |
| `create.body.business.tte` | `"UTF8"` |
| `create.body.business.speed` | `{"$toInt":{"$min":[100,{"$max":[0,{"$multiply":[{"$coalesce":[{"$if":{"condition":{"$ne":[{"$toFloat":{"$ref":"request.extra.audioSpeed"}},0]},"then":{"$toFloat":{"$ref":"request.extra.audioSpeed"}},"else":null}},1]},50]}]}]}}` |
| `create.body.data.status` | `2` |
| `create.body.data.text` | `{"$base64":{"$ref":"request.prompt"}}` |

## Provider 扩展键

- `providerOptions.xfyun-tts.appId`
- `providerOptions.xfyun-tts.voice`

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

使用在线语音合成（流式版）APPID、API Key、API Secret，不能使用讯飞其他产品的凭证。宿主使用 WSS 并计算 HMAC-SHA256 签名，签名地址不保存或返回浏览器；逐帧解码音频，完整结束后返回 MP3、16000Hz。官方文档 https://www.xfyun.cn/doc/tts/online_tts/API.html。

<!-- BEEFTV_PLUGIN_MANIFEST_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "beeftv.plugin/v2",
  "id": "xfyun-tts",
  "name": "科大讯飞在线语音合成",
  "version": "2.0.0",
  "author": "BeefTV Contributors",
  "description": "科大讯飞在线语音合成 独立请求协议插件。",
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
      },
      {
        "name": "secretKey",
        "type": "secret",
        "label": "API Secret",
        "required": true
      }
    ]
  },
  "contributes": {
    "providers": [
      {
        "id": "xfyun-tts",
        "label": "科大讯飞在线语音合成",
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
        "baseUrl": "https://tts-api.xfyun.cn",
        "requiresPublicMediaUrls": false,
        "auth": {
          "type": "xfyun-ws",
          "field": "apiKey",
          "secretField": "secretKey"
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
                    "$ref": "request.providerOptions.xfyun-tts.appId"
                  }
                },
                0
              ]
            },
            "message": "请填写讯飞 APPID"
          },
          {
            "assert": {
              "$gt": [
                {
                  "$len": {
                    "$ref": "request.providerOptions.xfyun-tts.voice"
                  }
                },
                0
              ]
            },
            "message": "请填写讯飞控制台已开通的发音人 ID"
          },
          {
            "assert": {
              "$lt": [
                {
                  "$utf8Length": {
                    "$ref": "request.prompt"
                  }
                },
                8000
              ]
            },
            "message": "讯飞单次在线合成文本必须小于 8000 字节"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v2/tts",
          "contentType": "application/json",
          "body": {
            "common": {
              "app_id": {
                "$ref": "request.providerOptions.xfyun-tts.appId"
              }
            },
            "business": {
              "aue": "lame",
              "sfl": 1,
              "auf": "audio/L16;rate=16000",
              "vcn": {
                "$ref": "request.providerOptions.xfyun-tts.voice"
              },
              "tte": "UTF8",
              "speed": {
                "$toInt": {
                  "$min": [
                    100,
                    {
                      "$max": [
                        0,
                        {
                          "$multiply": [
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
                            50
                          ]
                        }
                      ]
                    }
                  ]
                }
              }
            },
            "data": {
              "status": 2,
              "text": {
                "$base64": {
                  "$ref": "request.prompt"
                }
              }
            }
          },
          "audioStream": {
            "transport": "websocket",
            "audioPath": "data.audio",
            "codePath": "code",
            "donePath": "data.status",
            "doneValue": 2
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
