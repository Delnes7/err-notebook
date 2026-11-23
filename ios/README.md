# iOS 客户端

SwiftUI 承载 WKWebView，网页业务代码从仓库根目录构建到 App 内，不加载远程站点作为主界面。稳定的 `notebook://localhost` 来源为 App 提供独立的 IndexedDB / WebKit 本地存储。

## 开发与安装

1. 在仓库根目录运行 `python3 scripts/build_ios_web.py`。首次会下载版本固定的依赖，以后使用校验过的缓存。
2. 打开 `ios/ErrorNotebook.xcodeproj`，选择 `ErrorNotebook` scheme。
3. 选择 iPhone / iPad 模拟器后运行；真机需在 Signing & Capabilities 选择自己的 Team，必要时修改 Bundle Identifier。

生成的资源目录不提交至 Git。更新共享 `index.html`、`js/` 或 `css/` 后，先重新构建资源再运行 Xcode。禁止把个人备份、对话、密钥放进 App 资源目录。

面向 iOS / iPadOS 16.4 及以上；普通本地操作和公式图表可离线使用，AI 与 Supabase 仍需要网络。Apple 平台默认要求网络接口使用 HTTPS。

## 功能对应

| 功能 | iOS 实现 |
| --- | --- |
| 学科、单元、错题、选择题、分小问、题解、成绩与图表 | 同一份网页业务代码与数据模型 |
| 图片与相机 | WKWebView 系统文件/照片选择器；相机用途说明写入 Info.plist |
| HEIC、方向与大图缩放 | ImageIO 缩略图解码和 JPEG 输出，避免解码原始大图后再缩小 |
| Markdown、公式、图表、高亮 | 随 App 打包的版本固定脚本和字体 |
| 云同步 | 同一个 Supabase 项目和事务函数，数据仍按账号隔离 |
| JSON 备份导入 | 系统文件选择器及共享导入逻辑 |
| JSON 备份导出 | 原生分享面板，可保存到“文件”；单次 JSON 上限 128 MiB |
| A4 打印 | UIPrintInteractionController，保留共享打印 CSS |
| PDF 导出 | A4 UIPrintPageRenderer 生成多页 PDF，再通过系统面板分享 |
| AI Key | 本设备钥匙串，不进行钥匙串 iCloud 同步；JS 仅持有运行期副本 |
| 外部链接 | 原生浏览器窗口；外部网页不能获得 App 的原生消息桥接 |
| 深浅色、字号、iPad 与横屏 | 共享设置和响应式页面，适配原生安全区域 |

App 与 Safari 不共享本地数据库。可在网页导出 JSON 后从 App 导入，或登录同一个 Supabase 账号同步。AI 密钥需在 App 内单独设置。邮箱注册的确认邮件使用 Supabase 项目配置的 Site URL，确认后回到 App 登录。

## 原生安全边界

- 只提供 bundle 中的 Web 目录；路径规范化后校验目录边界。
- 原生消息仅接受 `notebook://localhost` 的主框架，不接受子框架或外部页面。
- 分享只生成 App 自己的 JSON / PDF 临时文件；完成或取消后清理。
- 设备钥匙串与测试钥匙串使用不同服务名，测试不读取真实密钥。
- Debug 可检查 WebView；Release 不开放检查器，不接收测试动作，也不打包测试脚本和 HEIC 样本。
- 原生代码不记录密钥、试题或登录令牌。开源依赖许可可从 App 设置查看。

## 测试

网页安全回归：

```bash
python3 scripts/test_web.py
```

模拟器集成测试（将设备名称替换为本机可用设备）：

```bash
xcodebuild -project ios/ErrorNotebook.xcodeproj \
  -scheme ErrorNotebook \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  test
```

`testOfflineSharedFeatures` 使用非持久的测试存储，验证离线资源、公式、数据库、密钥桥接、录题编辑、组卷、JSON 备份恢复、成绩页、HEIC 解码、PDF 正文及系统分享面板。`testPersistenceAcrossRelaunch` 使用单独的测试数据存储，验证终止进程后记录与钥匙串能否重新读取，随后清理测试条目。

这些测试不需要真实账号或 API Key。真机拍照、相册授权、剪贴板授权、AirPrint 打印机、真实 AI 服务和真实账号跨设备同步需在配置相应硬件或账号后单独验收。

2026-11-23 验证记录：

| 环境 | 结果 |
| --- | --- |
| iPhone 17 Pro / iOS 26.5 模拟器 | 3 个集成测试通过，含 JSON / PDF 分享、加权成绩与图表、重启持久化 |
| iPad mini / iPadOS 26.5 模拟器 | 2 个集成测试通过，含 HEIC 与桥接权限检查 |
| 真机 Release 编译（不签名） | 通过；尚未实际安装至物理设备 |
| 共享网页安全回归 | 3 个测试套件通过 |

## 发布

本工程可编译到模拟器，也可在关闭签名时编译真机 Release。安装真机、导出 IPA、TestFlight 和 App Store 分发需要项目作者的 Apple 签名配置。发布前应补齐自己的隐私政策 URL、App Store 元数据并复核 `PrivacyInfo.xcprivacy` 与实际使用的数据服务一致。
