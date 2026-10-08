# 自媒体本人账号：官方 API 接入边界

核对范围：抖音、小红书本人作品监测；优先 HTTP/OAuth，不依赖 Playwright、CDP 或网页点击。本文只记录官方文档证据，没有登录开发者控制台、申请权限或调用真实账号数据。

## 结论

抖音有官方作品列表、作品统计及按日数据接口，可以用普通 HTTP 客户端实现；主要前提是应用获批相应能力、账号完成对应授权。不能把注册应用、本人扫码登录理解为自动获得全部创作者后台数据。小红书的账号登录 OAuth 当前公开权限表仅开放基本资料；读取笔记仍标为规划中。其 Marketing API 和蒲公英 API 是另一些业务通道，需要分别核对准入与覆盖范围。

## 抖音

| 接口／权限 | 文档说明 | 对监测的含义 |
| --- | --- | --- |
| `GET /video/list/`，`video.list` | 需要申请权限和用户授权；作品列表包含标题、时间、封面、作品 ID 和播放、点赞、评论、分享等累计统计；旧文档称实时，并写最多获取 4 页、不支持时间过滤 | 可用于发现作品和建立累计指标快照；不能承诺全历史回填 |
| `POST /video/data/`，`video.data` | 需要申请权限和用户授权；只查询令牌对应用户自己的公开视频；批次建议不超过 10 个；旧文档称实时 | 可定期刷新已记录作品的累计指标；不等于平台提供秒级推送 |
| `GET /data/external/item/base/`，`data.external.item` | 需要申请权限和用户授权；含累计播放、点赞、评论、分享、平均观看时长；仅创建 30 天内作品；首次授权次日才产生全部数据，后续约次日 10 点刷新 | 更适合每日复盘，频繁轮询不会得到更实时的观看时长 |
| `GET /data/external/item/play/`，`data.external.item` | 返回按日期的播放数据；仅创建 30 天内作品；首次授权后次日产生全部数据 | 用于按日趋势，与累计实时统计分开存储 |

接口原始来源：[作品列表](https://open.douyin.com/platform/resource/docs/openapi/video-management/douyin/search-video/account-video-list/)、[作品统计](https://open.douyin.com/platform/resource/docs/openapi/video-management/douyin/search-video/video-data/)、[视频基础数据](https://open.douyin.com/platform/resource/docs/openapi/data-open-service/video-data/get-basic-data/)、[按日播放](https://open.douyin.com/platform/resource/docs/openapi/data-open-service/video-data/get-play-data/)。上述字段未证明能够取得完播率、曝光量和单作品涨粉等所有创作者后台指标；不得以不存在的字段填充产品合同。

**版本与权限需要额外核对。** 上述接口页属于旧文档站，页面注明自 2022 年 9 月 6 日起不再更新。这只能证明文档时效有限，不能推断接口已停用。当前[登录与授权](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/sdk/mobile-app/permission/overall-permission)仍提醒 `video.list`、`video.data`、`fans.data` 在 2023 年进行数据经营能力升级，数据经营能力需在 PC 端完成授权，并链接[升级公告](https://developer.open-douyin.com/announcement/122)；本轮公告正文无法抽取，不能据此编造 `.bind` 权限的当前准入细节。

当前[能力概览](https://partner.open-douyin.com/docs/resource/zh-CN/dop/ability/common-solution)说明能力需按具体文档核对准入条件，在应用能力管理提交场景申请，审核约 5～7 个工作日，获批后获得默认额度；不是任何开发者默认可用。当前[企业机构账号文档](https://partner.open-douyin.com/docs/resource/zh-CN/mini-app/open-capacity/operation/business-account/bizaccount)也列出账号可授权应用管理视频列表、视频数据。个人账号能否按本项目场景获批，尚未验证。

OAuth 可以通过用户主动扫码／打开授权页，后端用授权码换取 `access_token`，后续用 HTTP 请求读取与刷新令牌，全程不需要浏览器自动化。当前登录文档写 `access_token` 15 天、`refresh_token` 30 天，取消授权后令牌失效；回调完整 URL 需预先配置。桌面产品宜用受控后端回调与凭证存储，不能把应用 Secret 作为公开分发客户端中的安全秘密。[官方登录授权流程](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/sdk/mobile-app/permission/overall-permission)

## 小红书：四条渠道应分别判断

| 渠道 | 已确认内容 | 本人普通账号监测是否得到证明 |
| --- | --- | --- |
| 账号登录开放平台 `openaccount` | 标准 OAuth、HTTP 换令牌、刷新令牌、基本资料；`basic_info` 已开放；`user_profile`、`read_notes`、`write_notes`、`read_followers` 标为规划中 | 未证明能读取本人作品列表、曝光、阅读、完播等 |
| 电商开放平台 `open.xiaohongshu.com` | 应用类目主要面向商品、订单、库存、售后、素材中心等商家业务 | 不应以商品／订单接口替代创作者作品统计接口 |
| Marketing API／聚光 `ad-market` | 官方首页说明账户管理、投放报表、计划／单元／创意管理、多账号数据洞察 | 已证明广告业务 API 存在；未证明普通账号自然流量全量指标可用 |
| 蒲公英 API | 官方首页描述博主数据、报价、投后数据洞察，展示面向年流水超过 500 万客户的案例说明 | 不能把案例准入描述推断为所有端点统一门槛；也不能把合作投后数据等同本人全部笔记后台数据 |

来源：[OAuth 权限表](https://openaccount.xiaohongshu.com/docs/scope)、[快速接入](https://openaccount.xiaohongshu.com/docs/quick-start)、[HTTP API 参考](https://openaccount.xiaohongshu.com/docs/api-reference)、[电商应用开发说明](https://open.xiaohongshu.com/document/developer/file/33)、[Marketing API 官方首页](https://ad-market.xiaohongshu.com/)。营销平台文档中心本轮无法完整抽取，因此其具体笔记统计端点、专业号要求、审批要求及实时性仍需官方控制台／技术对接确认。这里的结论是“未获证明”，不是断言相关业务绝无 API。

小红书分享 SDK 能将内容送入发布流程，与读取账号历史作品和创作者统计是两种能力；分享平台不能直接解决监测。[官方分享平台](https://agora.xiaohongshu.com/)

## 适合本人小规模使用的接入顺序

1. 抖音先验证已有／可申请应用的作品列表与作品统计权限。获批后用 Go HTTP 客户端、定时任务、SQLite 保存作品与统计快照，先接播放、赞、评、分享；再申请按日观看时长等扩展。
2. 小红书先确认用户已有专业号、广告账号或蒲公英业务资格，向对应官方通道明确询问“本人全部笔记，包括未投放作品”的读取覆盖。仅取得基本资料 OAuth 时，界面不能显示成“数据账号已接入”。
3. 如果普通账号需要的官方能力暂不可用，采用后台导出文件导入，或者明确接受网页私有接口／第三方数据商的维护成本。纯 HTTP 私有接口仍依赖 Cookie、签名、风控和页面协议，不能因不使用 Playwright 就称为官方稳定 API。
4. 数据合同保存来源、采集时间、统计日期、指标单位和权限范围。字段缺失保留为空；累计值快照、按日数据、自然与付费数据不混算。

以上为接入建议，尚未实施。未运行测试、未使用账号凭证，也未修改产品代码。
