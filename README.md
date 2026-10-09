# dsh-workspace-default-model

给 DeepSeek Harness 加一个「按工作区决定新会话默认模型」的维度。

dsh 本身只有一个进程级默认模型（`agent-default-model` 那条 profile 条目），而**新会话**创建时只读这一个值。
本插件不改动它：当某个**新建的顶层会话**的目录落在你配置的映射里时，它会

1. 用 `ctx.llm.resolveCallConfig` 解析并校验该映射（与 Web 模型选择器相同的校验），把结果作为**该会话自己的模型选择**写入会话日志（`model/selection`）——所以选择器立刻显示这个模型，意图也会随会话持久化；
2. 通过一个 **prepend** 的 `agent/request` 瀑布把该会话**第一个请求**的路由换成映射的 provider/model（prepend 保证它压过入口点自身的选择钩子）。

第一个请求落盘后，请求头里就是映射的模型，后续步骤、恢复会话、fork 都自然沿用它；在会话里手动切换模型则优先于映射。

## 安装状态

- 已作为 bundle `dsh-workspace-default-model` 装进 `web` profile（pnpm `link:` 指向本目录），row id 是 `workspace-default-model`。
- 源码就是本目录：`index.js`（插件）、`match.js`（纯路径匹配，可单测）、`test/match.mjs`、`cordis.patch.yml`（只负责插入 row）。
- 因为 `link:` 安装时模块按**本目录**解析 import，本插件不 import 任何 Harness 包（否则会因解析不到 `@deepseek-ai/schemastery` 而导入失败）。代价：没有 schemastery `Config`，配置只在 `apply` 里做条目级校验（缺 path/provider/model 的条目被丢弃并 warn），也不出现在 Settings 表单里。

## 配置

映射写在 **profile 的 `cordis.patch.yml`** 里（覆盖同一个 row id；匹配的覆盖会整体替换 `config`）。
`$DSH_HOME` 默认是 `%USERPROFILE%\.dsh`，`web` profile 的路径是
`%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml`：

```yaml
- id: workspace-default-model
  name: dsh-workspace-default-model
  config:
    mappings:
      - path: C:\Users\123\Documents\BPR
        provider: dsh-opencode-go
        model: deepseek-v4-pro
        reasoningEffort: high
      - path: C:\Users\123\Documents\llama
        provider: dsh-opencode-go
        model: deepseek-v4.1-flash
      - path: C:\Users\123\Documents
        provider: strata
        model: qwen3.8-flash-next-iq3_s
```

- `path`：工作区目录（会话记录的 `cwd`）。最长匹配：会话目录等于该路径或在其之下，父目录映射可以覆盖一组工作区；Windows 不区分大小写。
- `provider` / `model`：必须是当前 profile 已注册且可路由的组合。
- `reasoningEffort`：可选；省略时用适配器/模型默认。
- 注意 `name:` 必须与 row 的名字**完全一致**（覆盖层里它只做校验，不负责改名），否则这条覆盖会被跳过并 warn。

### 生效时机

- 插件在 profile 启动时挂载。**如果安装前该 row 曾经导入失败，运行中的进程不会重新导入它，需要重启 `dsh web`。**
- 改 `mappings` 一般会被运行中的 Loader 热应用；如果没生效，重启即可。

### 注意

- **模型要在选择器里可见**：若该模型在 provider 的 `modelVisibility` 里被设为 `false`，它不在模型目录中，选择器会把它当作不可用并禁用发送。映射用到的模型请保持可见。
- 映射写错（provider/model 不存在或不可路由）时，该工作区的新会话首个请求会报模型错误；手动切换模型仍可用。
- 在会话里手动换模型会同时更新全局默认（dsh 既有行为），也会让本插件不再干预该会话。

## 生效范围

| 场景 | 是否套用映射 |
|---|---|
| Web/GUI 里在映射工作区新建会话 | 是 |
| `dsh headless` 在映射目录启动的新会话 | 是 |
| 恢复（resume）已有会话 | 否（沿用会话自己的请求头） |
| fork / 带 seed 的会话 | 否（沿用来源会话的模型） |
| 子代理会话 | 否 |
| 创建方显式指定的别的模型（如 webhook 的 `model`） | 否 |

## 验证

1. `dsh --profile web --dump-config` 里能看到 `workspace-default-model` 这一行及其 `mappings`（会标注被 `cordis.patch.yml` 打过补丁）。
2. 重启后的进程里：`cordis_inspect_query`（Host `Config`，`name: dsh-workspace-default-model`）状态应为 `absent`（= 已激活、无 Config schema），而不是 `inactive`。
3. 在映射工作区点「New Session」：模型选择器应显示映射的模型。
4. 发出第一条消息后，会话日志里 `request/header` 的 `config.provider/model` 就是映射值。
5. `node test/match.mjs`：路径匹配规则的本地自测。

## 卸载

在 profile 里禁用/移除 bundle `dsh-workspace-default-model`（Plugin Manager 页面或 `plugin_manager`），并删掉 `cordis.patch.yml` 里对应的覆盖条目。
