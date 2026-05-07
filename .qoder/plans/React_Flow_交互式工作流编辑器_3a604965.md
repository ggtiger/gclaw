# React Flow 交互式工作流编辑器

## 目标
将 CommandEditor 中的"流程图"视图从静态 Mermaid 升级为 React Flow 交互式编辑器，支持拖拽节点、连线、选中配置属性。

## 技术选型
- **@xyflow/react** (React Flow v12) - 成熟的 React 流程图库，~50KB，支持自定义节点、拖拽、连线、minimap
- 项目已有 React 19 + TypeScript + Tailwind，完全兼容

## Task 1: 安装依赖 + 基础架构

安装 `@xyflow/react`。

新建 `components/commands/workflow-editor/` 目录：
- `WorkflowEditor.tsx` - 主编辑器组件，包含 ReactFlow 画布 + 右侧属性面板
- `nodes/` - 自定义节点组件
- `utils.ts` - 步骤数据与 React Flow 节点/边的双向转换

## Task 2: 自定义节点组件

为 5 种步骤类型创建自定义节点（`nodes/` 目录下）：

**统一节点组件** `StepNode.tsx`：
- 根据 `data.stepType` 渲染不同样式
- prompt 节点：蓝色，显示图标 + 步骤名 + userMessage 预览
- script 节点：绿色，显示终端图标 + 命令预览
- condition 节点：菱形/橙色，显示条件表达式，有"是/否"两个输出端口
- parallel 节点：紫色，较大尺寸，显示分支数量
- command-ref 节点：灰色，显示引用的命令 ID
- 选中态：加粗边框 + 阴影
- 每个节点有输入端口（顶部）和输出端口（底部）
- condition 节点有两个输出端口（左=否，右=是）

## Task 3: 数据转换层 (utils.ts)

**stepsToFlow(steps: CommandStep[])**：
- 将 CommandStep 数组转为 React Flow 的 `Node[]` + `Edge[]`
- 自动布局：从上到下排列，间距 180px
- 顺序步骤用普通 edge 连接
- condition 的 then/else 分支用带标签的 edge
- parallel 的 branches 展开为水平排列的子节点

**flowToSteps(nodes: Node[], edges: Edge[])**：
- 反向转换：从节点位置和连线关系重建 CommandStep 数组
- 根据 Y 坐标排序确定执行顺序
- 根据 edge 来源/目标确定 condition 的 then/else

## Task 4: WorkflowEditor 主组件

`WorkflowEditor.tsx` 布局：
```
+------------------------------------------+
| 工具栏：[+ 添加步骤 v] [自动布局] [适应] |
+------------------------+-----------------+
|                        |                 |
|    React Flow 画布     |   属性面板      |
|    (拖拽/连线/缩放)    |   (选中节点     |
|                        |    的配置表单)  |
|                        |                 |
+------------------------+-----------------+
```

**画布功能**：
- 拖拽移动节点
- 节点间拖拽连线
- 框选/点选
- 滚轮缩放 + 平移
- 键盘 Delete 删除选中节点
- "添加步骤"下拉菜单（5 种类型），添加后出现在画布中央

**属性面板**（右侧，约 320px 宽）：
- 未选中节点时显示"选择一个步骤进行编辑"
- 选中节点后显示该步骤类型对应的配置表单
- 表单内容复用现有 CommandEditor 中各步骤类型的表单字段
- 修改实时同步到节点显示和 form state

## Task 5: 集成到 CommandEditor

修改 `components/commands/CommandEditor.tsx`：
- 将流程图 Tab 的 MermaidBlock 替换为 WorkflowEditor 组件
- 双向同步：
  - 表单视图修改步骤 -> 流程图自动更新（通过 stepsToFlow）
  - 流程图拖拽/连线/属性面板修改 -> 表单 state 自动更新（通过 flowToSteps）
- 保留表单视图和 JSON 视图作为备选编辑方式

## 依赖关系
```
Task 1 (安装+架构) -> Task 2 (自定义节点) -> Task 3 (数据转换)
                                            -> Task 4 (主组件) -> Task 5 (集成)
```
Task 2 和 Task 3 可并行，Task 4 依赖两者，Task 5 最后。

## 涉及文件

| 操作 | 文件路径 |
|------|---------|
| 新建 | `components/commands/workflow-editor/WorkflowEditor.tsx` |
| 新建 | `components/commands/workflow-editor/nodes/StepNode.tsx` |
| 新建 | `components/commands/workflow-editor/utils.ts` |
| 修改 | `components/commands/CommandEditor.tsx` |
| 修改 | `package.json`（新增 @xyflow/react） |
