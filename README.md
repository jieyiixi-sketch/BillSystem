# CableFlow Document System v2

浏览器端的报价单 / 发票 / 现金销售单系统（基于 YTC/AKVIRUS Excel 版式）。

## 运行

1. 安装 Node.js 18 或更新版本。
2. 用 VS Code 打开本文件夹，打开终端，运行：

   ```bash
   npm start
   ```

3. 用 Chrome 或 Edge 打开 <http://localhost:8080>。

不需要 `npm install`，只用 Node 内置模块和浏览器 API。

运行测试：`npm test`

## 首次设置

打开 **Company settings**，填写公司名称、UEN、地址、联系方式、银行资料和默认的 “Prepared by”。设置和所有文档都保存在当前浏览器的 localStorage 中。

## 使用

- 新建并保存报价单；用 **Convert to Invoice / Cash Sales** 复用客户和明细（备注会自动换成对应类型的默认条款）。
- **Print / PDF** 输出 A4。在任何页面点击都会先切回当前文档再打印。
- 已保存文档可搜索、打开、复制、删除。
- 有未保存修改时，关闭页面会提示；系统每 30 秒自动保存草稿，下次打开可恢复。

## 可选：Google Drive 备份

1. 打开 [Google Cloud Console](https://console.cloud.google.com/)，创建或选择项目。
2. 启用 **Google Drive API**，配置 OAuth consent screen。
3. 创建 **OAuth client ID**（类型 **Web application**），在 **Authorized JavaScript origins** 加入 `http://localhost:8080`。
4. 复制 Client ID（不要创建或粘贴 Client Secret）。
5. 在 CableFlow 的 **Company settings** 粘贴 Client ID，勾选 Drive 备份，保存设置，再点 **Connect Google Drive**。

- 同一份文档再次保存会**更新同一个 Drive 文件**，不会产生重复备份。
- Google 脚本只在启用 Drive 时才加载，离线也能正常使用。
- 访问令牌只保存在内存中，刷新页面后需要重新连接。

## 文件结构

```
server.js          本地服务器（服务 dist/）
tests.js           单元测试（node --test）
dist/
  index.html       界面和文档版式
  style.css        屏幕 + A4 打印样式（已合并）
  logo.png         公司 logo
  js/calc.js       纯函数：金额、日期、编号、条款（可在 Node 测试）
  js/storage.js    带容错的 localStorage 封装
  js/drive.js      Google Drive 备份
  js/app.js        界面逻辑
```
