# dsh-workspace-default-model

给 DeepSeek Harness 加一个「按工作区决定新会话默认模型」的维度，并在**设置里提供一整页**用来选择每个工作区的默认模型。

dsh 本身只有一个进程级默认模型（`agent-default-model` 那条 profile 条目），而**新会话**创建时只读这一个值。
本插件不改动它：当某个**新建的顶层会话**的目录落在你配置的映射里时，它会

1. 用 `ctx.llm.resolveCallConfig` 解析并校验该映射（与 Web 模型选择器相同的校验），把结果作为**该会话自己的模型选择**写入会话日志（`model/selection`）——所以选择器立刻显示这个模型，意图也会随会话持久化；
2. 通过一个 **prepend** 的 `agent/request` 瀑布把该会话**第一个请求**的路由换成映射的 provider/model（prepend 保证它压过入口点自身的选择钩子）。

第一个请求落盘后，请求头里就是映射的模型，后续步骤、恢复会话、fork 都自然沿用它；在会话里手动切换模型则优先于映射。

## 设置页面

**Sidebar → Settings → 「按工作区默认模型」**（`settings.section` 里 id 为 `workspace-default-model` 的一页，排在官方 Models/Plugins 之后）。

- 页面按**你实际的工作区**列出每一行，每行一个 provider/model 选择器；模型带思考强度时还会多一个强度选择器。
- 选「跟随全局默认模型」= 该工作区不写映射；页面顶部会显示当前的全局默认模型，方便对照。
- **保存**写的是本插件自己的 Config：落到 profile 的 `cordis.patch.yml` 里 `workspace-default-model` 这条覆盖的 `config.mappings`，运行中的 Loader 热应用，不用重启。
- 模型列表来自 Host 的 `remote.session.modelCatalog()`；已保存但当前不在目录里的模型会标注「不在当前模型列表中」并保留，不会偷偷丢掉。
- 写入带 revision 栅栏（settings 服务的行为）：别处改过配置时，页面会拒绝覆盖并提示，而不是静默丢掉你的修改。

手写 YAML 依然有效，页面和 YAML 是同一份配置：页面不打开时你可以继续直接编辑 `cordis.patch.yml`。

### 客户端怎么拿模型目录（一个容易踩的坑）

- 页面的硬依赖只有 `slots` 和 `locale`，所以即使 composition 里没有任何 Remote，页面照样出现，只是模型列表读不出来（并会说明原因）。
- 目录来自 `remote.session.modelCatalog()`。但 **`remote.session` 不是 `remote` 服务的属性**：api-gateway 为每个命名空间单独注册了一个 Cordis 服务 `RemoteNamespaceService`，键名是 `remote.<namespace>`（`remoteServiceKey(ns) => \`remote.${ns}\``）。因此 `inject: ['remote']` 不够——取 `.session` 会被反射层拦下并报 `cannot get property "remote.session" without inject`。
- 正确写法是在子上下文里拿它：

  ```js
  ctx.inject(['remote', 'remote.session'], (child) => {
    const ns = child.get('remote.session');   // 命名空间服务
    // …用它调用 ns.modelCatalog()
  });
  ```

  这样既满足 inject 约束，又顺便消掉「命名空间挂载晚于插件启动」的竞态（`dsh.client.inject` 只是预取元数据，**不保证 apply 顺序**）。
- 目录里**单个 provider 拉取失败**不会让整个调用失败：失败项在 `ModelCatalog.failures` 里，页面会把它们列出来（"这些 provider 没有返回模型列表"），这就是列表"不全"的常见原因。

### 首次生效需要重启一次 dsh

客户端半（`client.js`）是新加的：`dsh-client-modules` 的扫描结果**按 Loader specifier 缓存到进程结束**，包在启动时被判为「没有客户端半」之后不会再被扫描。所以**装好之后要重启一次 `dsh web`**（并刷新页面），之后这一页才会出现在设置里。Host 半（映射策略）同样在重启后带上新的 Config。

此后改 `client.js` 由 client-modules 的 bundle watch 重建，刷新页面即可；**改 `index.js`（Host 半）必须重启**——实测运行中的 HMR 不会重载这个 `link:` 到工作区目录的模块。

## 安装状态

- 已作为 bundle `dsh-workspace-default-model` 装进 `web` profile（pnpm `link:` 指向本目录），row id 是 `workspace-default-model`。
- 源码就是本目录：`index.js`（Host：策略 + Config）、`client.js`（设置页面）、`match.js`（纯路径匹配，可单测）、`test/*.mjs`（自测）、`cordis.patch.yml`（只负责插入 row）。
- 因为 `link:` 安装时模块按**本目录**解析 import，本插件不 import 任何 Harness 包。`@deepseek-ai/schemastery` 只能在加载时用 `createRequire` 现找，按顺序试：`$DSH_PROFILE_DIR/package.json` → `$DSH_HOME/profiles/$DSH_PROFILE/package.json` → **`process.argv` 里像 `.js` 的入口路径（也就是正在运行的 dsh 自己）** → `%APPDATA%\npm\node_modules\@deepseek-ai\dsh\package.json` → `~/.dsh/profiles/*/package.json` → 当前工作目录。
  **注意**：harness 进程自己的 env 里**没有** `DSH_PROFILE_DIR`（那是 composition 注入给 shell 调用的），所以只靠环境变量的写法一定失败——第 3、5 条才是真正兜底的候选。全部失败时 `Config` 为 `undefined`：映射策略照常工作，只是设置页无法读写它（页面会说明原因并列出 Host 实际提供的命名空间）。
- 重新执行 `plugin_manager install_bundle` 指向本目录会报 `ambiguous-install`：插件管理器在依赖已存在（同一个 `link:` spec）时无法把「目标」归一到一个依赖名，于是拒绝继续。这是管理器的限制，不是安装坏了——依赖本来就在，改完源码重启即可。

## 配置

映射是本插件的 Config（`Config.mappings`，`volatile`，所以设置页能写、Loader 能热应用）。等价写法写在 **profile 的 `cordis.patch.yml`** 里（覆盖同一个 row id；匹配的覆盖会整体替换 `config`）：

```yaml
- id: workspace-default-model
  name: dsh-workspace-default-model
  config:
    mappings:
      - path: C:\work\my-project
        provider: dsh-opencode-go
        model: deepseek-v4-pro
        reasoningEffort: high
      - path: C:\work\another-project
        provider: dsh-opencode-go
        model: deepseek-v4.1-flash
      - path: C:\work
        provider: strata
        model: qwen3.8-flash-next-iq3_s
```

- `path`：工作区目录（会话记录的 `cwd`）。最长匹配：会话目录等于该路径或在其之下，父目录映射可以覆盖一组工作区；Windows 不区分大小写。
- `provider` / `model`：必须是当前 profile 已注册且可路由的组合。缺失 `path`/`provider`/`model` 的条目在运行时会**被丢弃并 warn**，不会因此让整条 row 失效。
- `reasoningEffort`：可选；省略时用适配器/模型默认。**写了一个该模型不支持的强度时，插件会退回「不要这个强度」再解析一次**：丢掉的是强度，不是模型路由（并 warn 说明）。这样某个工作区不会因为一个多余的 effort 而悄悄回到全局默认模型。
- 注意 `name:` 必须与 row 的名字**完全一致**（覆盖层里它只做校验，不负责改名），否则这条覆盖会被跳过并 warn。

### 生效时机

- 插件在 profile 启动时挂载：新进程一定会挂上它。运行中的进程对某次导入失败的 row 不保证立刻重试——`cordis_inspect_query`（Host `Config`）里状态是 `schema`（有 Config）就表示新代码已装好；`absent` 在旧版本里是正常状态，新版本里则可能意味着 schemastery 没解析到。
- 改 `mappings` 一般会被运行中的 Loader 热应用；如果没生效，重启即可。

### 注意

- **模型要在选择器里可见**：若该模型在 provider 的 `modelVisibility` 里被设为 `false`，它不在模型目录中，选择器会把它当作不可用并禁用发送。设置页会用「不在当前模型列表中」标出这种情况。
- 映射写错（provider/model 不存在或不可路由）时，该工作区的新会话首个请求会报模型错误；手动切换模型仍可用。
- 在会话里手动换模型会同时更新全局默认（dsh 既有行为），也会让本插件不再干预该会话。**这也是「新会话模型又变了」的常见来源**：映射优先于你在会话里刚选的那个模型。想换某工作区的默认，就在设置页改那一行。

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
2. 重启后的进程里：`cordis_inspect_query`（Host `Config`，`name: dsh-workspace-default-model`）状态应为 `schema`。
3. 页面侧：`cordis_inspect_query`（Client `Slots`，root `settings.section`）的 occupants 里应出现 `id: workspace-default-model`；设置里点进去应能看到工作区行、全局默认模型和「保存」。
4. 在映射工作区点「New Session」：模型选择器应显示映射的模型。
5. 发出第一条消息后，会话日志里 `request/header` 的 `config.provider/model` 就是映射值。
   也可以直接跑 `npm run probe:sessions -- 8`：按写入时间列出最近几个会话的 `cwd`、**首个 `model/selection`** 和 **首个 `request/header`** 路由。
   - `selection` = 会话创建时插件套用的映射（手动换过模型则后面还会有第二条 `model/selection`）；
   - `request` = 真正发出去的第一个请求。两者不同通常意味着**会话里手动换过模型**——手动切换优先于映射，这是设计如此。
6. 离线自测（不需要 Harness 运行）。脚本**不写死任何机器路径**：统一通过 `test/env.mjs` 按 `$DSH_PROFILE_DIR` → 正在运行的 dsh 入口 → `~/.dsh/profiles/*` → `%APPDATA%` 的顺序自发现环境，环境不全的用例报 `SKIP` 而不是误报失败。
   - `npm test`：路径匹配规则 + Host 策略断言（下面两条）。
   - `node test/match.mjs`：路径匹配规则（纯函数，不需要任何 dsh 环境）。
   - `node test/host-probe.mjs`：用最小 Cordis 上下文跑真实的 `apply`，覆盖设置页策略、映射命中、首个请求改路由、不支持的 effort 退回、resume/fork/子代理不干预、活引用 Config 等 23 项断言。
   - `npm run probe:resolve`：模拟**真实 harness 进程**的三种形态（没有 `DSH_*` env、argv 是 dsh 入口、argv 无信息）证明 `Config` 都能解析出来——这是「设置页说没有配置命名空间」那个 bug 的回归测试。
   - `npm run probe:config`：`Config` 能被解析、一份 `mappings` 能通过校验、`volatile` 字段是活引用、缺 `provider`/`model` 的条目会被 schema 拒绝。
   - `npm run probe:sessions -- 8`：从真实会话日志里读路由（`DSH_HOME` 或 `DSH_SESSIONS_DIR` 可覆盖位置）。

## 卸载

在 profile 里禁用/移除 bundle `dsh-workspace-default-model`（Plugin Manager 页面或 `plugin_manager`），并删掉 `cordis.patch.yml` 里对应的覆盖条目。
