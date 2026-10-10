# 同一任务的安全接续

先 GET /v1/tasks/{taskId}，按 target.attemptId 查询 GET /v1/attempts/{attemptId}。读取最新 state、reason、stage、停止证明及提交意图。所有接续通过 Skill 凭据调用；不调用执行器专属 claims、events 或 submit-intent，不伪造完成事件。

## 状态处理

| 当前情况 | 行为 |
|---|---|
| queued / running | 查询等待；不发第二个创建请求或并发接续 |
| draft_saved / published | 当前目标结束，不再次点击 |
| submitted / outcome_unknown | 最多两次 POST /v1/targets/{id}/reconcile，body={}；等核对结束再决定下一次，仅核对已有结果 |
| stay + AWAITING_PUBLISH_CONFIRMATION | 已完成保持页面的指令，报告未发布；不能私自升级 finish |
| failed、未知原因、账号/素材不符、缺授权 | 停止该目标，报告原因、阶段、下一步 |
| 已停止的小红书 live/video/fill 准备中断 | continuous 模式下按下面白名单原页接续 |

submitted 的核对完成后仍 submitted 或未知，就报告实际状态；平台审核可能超出跟踪窗口。出现 submit-intent、取消或撤销后，禁止接续填写或重新提交。服务拒绝接续时不换新任务绕过。普通 resume 不能用于已经开始真实填写的任务。

## 视频接续白名单

共同条件：原任务的内容、账号、电脑、安装、素材、finish 不变；原执行确已停止；未提交、未取消、未撤销；原编辑页仍存在。仅服务器接受且扩展复核原页后才继续。若只读浏览器不可用，普通页面复核交给扩展；依赖人工画面判断的封面确认必须停下，不伪造摘要或裁切同意。

调用 `POST /v1/targets/{targetId}/continue-video`，每次保存独立 request/receipt；同一次调用网络超时复用回执。下表条件需结合最新 attempt，不能仅看 reason.code 盲发。

| 原因 | 请求与条件 |
|---|---|
| VIDEO_UPLOAD_UNCONFIRMED | `{}`；复核原视频及空文案，不重传 |
| CONTENT_MISMATCH | `{}`；入口只接受完整原题文且没有话题，不覆盖不同内容 |
| TOPIC_NOT_FOUND | `{}`；只续选精确有序话题前缀后的待选项，不重复输入 |
| CONTINUATION_UNVERIFIED | `{}`；必须已有 videoContinuation 链及可信停止证明 |
| PREPARATION_INTERRUPTED、VIDEO_PREVIEW_FETCH_FAILED、VIDEO_PREVIEW_BODY_FAILED、VIDEO_PREVIEW_BYTES_FAILED、VIDEO_PREVIEW_HASH_FAILED | `{}`；必须已有 videoContinuation，且原次无 textAlreadyFilled/topicsAlreadyFilled/coverAlreadyUploaded；复核原视频与空编辑区 |
| VIDEO_COVER_CONTROL_UNVERIFIED | `{"coverSelection":"horizontal"}` 或 vertical；仅选择用户已指定的原任务封面，未确定时询问 |
| COVER_IDENTITY_UNCONFIRMED | 已固定 coverSelection、话题完成时可用 `{}` 复核已上传封面，不重传；存在本篇当前画面的裁切同意且原次 coverAlreadyUploaded=true 时才可传 `{"acceptCoverCrop":true}` |
| PREVIEW_MISMATCH | 仅限已选封面、已接受裁切且原次 coverAlreadyUploaded=true；按下方只读核对后提交 confirmedCoverPreviewSha256 |

合集找不到、名字不完全一致或重复、原创须知未同意、登录不符都不在自动接续白名单。其余原因不尝试泛化恢复。相同原因只有在可验证进度改变时才继续，例如已选话题增加、封面由未上传到已上传；预算见 SKILL.md。

### 封面预览确认

仅当用户已接受本篇当前裁切，且只读画面核对仍相符时使用。读取原编辑页唯一 `.cover.cover--row > .default.row` 的 `style.backgroundImage` 原始字符串，对其 UTF-8 字节计算 SHA256，64 位小写十六进制传为 `confirmedCoverPreviewSha256`。这是当前封面引用的摘要，**不是图片像素摘要**。不能使用源文件摘要、猜测 URL 或旧页面摘要。无唯一元素、画面不同或无法核对时暂停。

## 网络、重复发布与取消

- 网络/超时/429/5xx：同一调用最多重试两次，保留幂等键，分别至少等待 5 秒、15 秒并遵守 Retry-After；更长等待分段，达到总预算就保留回执并报告。401 停止更换凭据流程；422 展示字段错误；409 先读取最新状态，不创建替代任务。
- 用户要求取消：POST /v1/tasks/{id}/cancel，body={}；执行中仍须确认停止，已提交不能声称撤回。
- 用户明确要求重发：解释重复风险并取得本次确认，再使用新任务键、target.replacesTargetId 和 confirmation.duplicateRiskAccepted=true。未明确要求重发时始终保留原任务。
- 每个操作与结果写入运行记录，保留原因、阶段、证据及实际接续计数。达到次数/时间限制不宣称成功，也不把仍运行的任务改称失败。
