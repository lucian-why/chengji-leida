# 开发注意事项

## 禁止使用 PowerShell `-replace` 操作中文文件

**严重程度：高**

在包含中文字符的文件中，**严禁**使用 PowerShell 的 `-replace` + `Set-Content -Encoding UTF8` 进行批量替换。

### 问题原因

PowerShell 的 `-replace` 是基于字符的盲目全局替换，配合 `Set-Content -Encoding UTF8` 处理中文多字节字符时，会截断 UTF-8 字节序列，导致编码错位，产生不可逆的乱码。

### 错误示例

```powershell
# 不要这样做！
powershell -Command "(Get-Content 'file.js') -replace '年级排名','校排名' | Set-Content 'file.js' -Encoding UTF8"
```

### 正确做法

需要替换中文内容时，使用以下方式：

1. **代码编辑器的查找替换**（推荐）— 直接在 VS Code 等编辑器中手动替换
2. **Node.js 脚本** — 用 `fs.readFileSync` + `String.replace` + `fs.writeFileSync`，并确保以 UTF-8 编码读写
3. **CodeBuddy 工具** — 使用 `replace_in_file` 工具进行精确替换，它会正确处理编码

### 历史事故

- 2026-04-03：对 `utils/format.js` 执行 `-replace '年级排名','校排名'`，导致 `buildRankTags` 函数中所有中文字符串变为乱码（如 `鐝?{value}`、`骞寸骇绗?{value}鍚峘`），小程序无法编译。
