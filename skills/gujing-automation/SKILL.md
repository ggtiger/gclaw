---
name: gujing-automation
description: "古井网站(www.gujing.cn)浏览器自动化操作，支持登录、页面内容读取和交互操作"
allowed-tools:
  - Bash(agent-browser:*)
read_when:
  - 用户需要操作古井网站
  - 用户提到 gujing 或古井
  - 需要登录古井系统并执行自动化任务
metadata:
  openclaw:
    emoji: "🏢"
    requires:
      bins: ["agent-browser"]
---

# 古井网站浏览器自动化

通过 agent-browser CLI 对 www.gujing.cn 进行自动化操作，包括登录认证、页面内容获取和交互操作。

## 核心流程

整体流程分为三步：**登录认证 → 获取 sid → 执行目标操作**

---

## 一、登录流程

登录需要完成：用户名 + 密码 + 人脸扫码认证（需人工干预）。

### 步骤 1：打开登录页

```bash
agent-browser open "${GUJING_BASE_URL}"
```

### 步骤 2：获取页面快照，定位登录表单

```bash
agent-browser snapshot -i
```

从快照中找到用户名输入框、密码输入框和登录按钮的元素引用（如 @e1, @e2, @e3）。

### 步骤 3：填写用户名和密码

```bash
agent-browser click @e1
agent-browser fill @e1 "${GUJING_USERNAME}"
agent-browser click @e2
agent-browser fill @e2 "${GUJING_PASSWORD}"
```

### 步骤 4：点击登录/提交按钮

```bash
agent-browser click @e3
```

### 步骤 5：等待人脸扫码认证

此时页面会弹出人脸扫码认证界面，**必须暂停并通知用户完成扫码**。

处理方式：
1. 截图当前页面，展示给用户确认扫码界面已出现
2. **明确告知用户**：请使用手机完成人脸扫码认证
3. 等待用户确认已完成扫码
4. 轮询检测页面是否已跳转（登录成功后 URL 会发生变化）

```bash
# 截图展示扫码界面
agent-browser screenshot face-scan.png

# 用户确认完成扫码后，检测页面状态
agent-browser eval "window.location.href"
```

> **重要**：人脸扫码环节无法自动化，必须等待用户手动完成。在用户确认完成前不要继续后续操作。

### 步骤 6：验证登录成功

```bash
# 检查页面 URL 是否已跳转到登录后的页面
agent-browser eval "window.location.href"
# 获取页面快照确认登录状态
agent-browser snapshot -i
```

---

## 二、获取 sid

登录成功后，从 cookie 或 URL 中提取 sid 用于后续请求。

### 方式 A：从 Cookie 获取

```bash
agent-browser cookies
```

在返回的 cookie 列表中查找名为 `sid`、`sessionId` 或类似字段的值。

### 方式 B：从 URL 参数获取

```bash
agent-browser eval "new URLSearchParams(window.location.search).get('sid')"
```

### 方式 C：从页面 JS 变量获取

```bash
agent-browser eval "window.sid || document.cookie.match(/sid=([^;]+)/)?.[1] || ''"
```

### 将 sid 存入变量

获取到 sid 后，将其存入 Shell 变量供后续使用：

```bash
# 将获取的 sid 存入环境变量（根据实际获取方式选择）
SID=$(agent-browser eval "new URLSearchParams(window.location.search).get('sid')" | tr -d '\n')
echo "当前 sid: $SID"
```

> 按 A → B → C 顺序尝试，获取到 sid 后存入 `$SID` 变量备用。

---

## 三、执行目标操作

携带 sid 访问用户指定的目标 URL，执行内容读取或交互操作。

### 导航到目标页面

```bash
# 如果目标 URL 需要拼接 sid
agent-browser open "${GUJING_BASE_URL}/target/page?sid=${SID}"

# 或直接导航（cookie 中已有 sid）
agent-browser open "${GUJING_BASE_URL}/target/page"
```

### 读取页面内容

```bash
# 获取页面快照
agent-browser snapshot -i

# 获取特定元素文本
agent-browser get text @e5

# 获取页面标题
agent-browser eval "document.title"

# 截图保存
agent-browser screenshot result.png
```

### 表单填写

```bash
agent-browser snapshot -i
agent-browser click @e10
agent-browser fill @e10 "填写内容"
agent-browser press Tab
agent-browser fill @e11 "其他内容"
```

### 点击操作

```bash
agent-browser click @e15
# 等待页面响应
agent-browser snapshot -i
```

### 下拉选择

```bash
# 点击下拉框
agent-browser click @e20
# 获取新快照查看选项
agent-browser snapshot -i
# 点击目标选项
agent-browser click @e21
```

### 等待元素加载

```bash
agent-browser wait @e30
```

---

## 四、错误处理

### 登录失败

```bash
# 检查是否有错误提示
agent-browser snapshot -i
# 查看页面是否仍在登录页
agent-browser eval "window.location.href"
```

如果登录失败，检查：
- 用户名密码是否正确
- 人脸扫码是否超时
- 网络连接是否正常

### 页面加载超时

```bash
# 等待页面加载完成
agent-browser eval "document.readyState"
# 如果未 complete，稍等后重试
agent-browser snapshot -i
```

### sid 失效

如果操作过程中出现权限错误或跳转到登录页，说明 sid 已失效，需要重新执行登录流程。

### 元素未找到

如果快照中未找到目标元素：
1. 确认页面已完全加载
2. 尝试滚动页面：`agent-browser eval "window.scrollBy(0, 500)"`
3. 重新获取快照：`agent-browser snapshot -i`

---

## 五、注意事项

1. **人脸扫码不可跳过**：每次登录都需要人工完成人脸认证，无法自动化此步骤
2. **元素引用会变化**：每次 `snapshot -i` 后元素引用（@eN）会重新编号，操作前务必获取最新快照
3. **会话有效期**：sid 可能会过期，长时间操作需要关注会话状态
4. **操作节奏**：每次交互后建议重新获取快照，确认页面状态再继续
5. **环境变量**：用户名密码从 `.env` 文件读取，首次使用需配置
6. **操作完成后关闭浏览器**：

```bash
agent-browser close
```

---

## 六、完整操作示例

```bash
# 1. 打开登录页
agent-browser open "${GUJING_BASE_URL}"
agent-browser snapshot -i

# 2. 填写凭据（根据快照中的实际元素引用调整）
agent-browser fill @e1 "username"
agent-browser fill @e2 "password"
agent-browser click @e3

# 3. 等待人脸扫码（通知用户）
agent-browser screenshot face-scan.png
# >>> 请用户完成人脸扫码 <<<

# 4. 确认登录成功，获取 sid
agent-browser eval "window.location.href"
agent-browser cookies

# 5. 导航到目标页面并操作
agent-browser open "${GUJING_BASE_URL}/target"
agent-browser snapshot -i
agent-browser get text @e5

# 6. 完成后关闭
agent-browser close
```
