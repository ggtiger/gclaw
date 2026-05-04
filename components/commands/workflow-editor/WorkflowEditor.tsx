'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Node,
  type Edge,
  type OnConnect,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Plus, LayoutGrid, Maximize2, Minimize2, ChevronDown } from 'lucide-react'
import type {
  CommandStep, PromptStep, ScriptStep, ConditionStep, CommandRefStep, ParallelStep,
} from '@/types/commands'
import StepNode from './nodes/StepNode'
import { stepsToFlow, flowToSteps, autoLayout } from './utils'

// ── Types ──

interface WorkflowEditorProps {
  steps: CommandStep[]
  onStepsChange: (steps: CommandStep[]) => void
  selectedStepId?: string | null
  onSelectStep?: (stepId: string | null) => void
}

const STEP_TYPE_OPTIONS = [
  { value: 'prompt', label: 'AI 对话' },
  { value: 'script', label: '脚本执行' },
  { value: 'condition', label: '条件判断' },
  { value: 'parallel', label: '并行执行' },
  { value: 'command-ref', label: '引用命令' },
] as const

const ERROR_STRATEGIES = ['stop', 'continue', 'retry'] as const

const inputClass = 'w-full px-2.5 py-1.5 rounded border text-sm outline-none transition-colors focus:border-[var(--color-primary)]'
const inputStyle = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
}
const labelClass = 'block text-xs font-medium mb-1'
const labelStyle = { color: 'var(--color-text-secondary)' }

function createEmptyStep(type: CommandStep['type']): CommandStep {
  const id = `step_${Date.now()}`
  const base = { id, name: '', onError: 'stop' as const }
  switch (type) {
    case 'prompt': return { ...base, type: 'prompt', userMessage: '', outputVar: '' }
    case 'script': return { ...base, type: 'script', command: '' }
    case 'condition': return { ...base, type: 'condition', if: '', then: '' }
    case 'command-ref': return { ...base, type: 'command-ref', commandId: '' }
    case 'parallel': return { ...base, type: 'parallel', branches: [[]] }
  }
}

// ── Inner editor (must be inside ReactFlowProvider) ──

function WorkflowEditorInner({ steps, onStepsChange, selectedStepId, onSelectStep }: WorkflowEditorProps) {
  const nodeTypes = useMemo(() => ({ stepNode: StepNode }), [])
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedNode, setSelectedNode] = useState<string | null>(selectedStepId ?? null)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const addMenuRef = useRef<HTMLDivElement>(null)
  const reactFlowInstance = useReactFlow()
  const initialFitDone = useRef(false)

  // Sync from external steps → nodes/edges
  const stepsRef = useRef(steps)
  const suppressSync = useRef(false)
  const nodesRef = useRef<Node[]>([])

  // Keep nodesRef in sync
  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  useEffect(() => {
    stepsRef.current = steps
    if (suppressSync.current) {
      suppressSync.current = false
      return
    }
    const { nodes: newNodes, edges: newEdges } = stepsToFlow(steps)
    // Preserve existing node positions (so drag positions aren't lost)
    const positionMap = new Map(nodesRef.current.map(n => [n.id, n.position]))
    const mergedNodes = newNodes.map(n => {
      const existingPos = positionMap.get(n.id)
      return existingPos ? { ...n, position: existingPos } : n
    })
    setNodes(mergedNodes)
    setEdges(newEdges)
  }, [steps, setNodes, setEdges])

  // Sync selected step from outside
  useEffect(() => {
    if (selectedStepId !== undefined) {
      setSelectedNode(selectedStepId)
    }
  }, [selectedStepId])

  // Close add-menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as HTMLElement)) {
        setShowAddMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ESC key exits fullscreen
  useEffect(() => {
    if (!isFullscreen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isFullscreen])

  // Fit view when entering fullscreen or on first meaningful render
  useEffect(() => {
    if (isFullscreen) {
      setTimeout(() => reactFlowInstance.fitView({ padding: 0.2 }), 100)
    }
  }, [isFullscreen, reactFlowInstance])

  // Initial fit view once nodes are available
  useEffect(() => {
    if (!initialFitDone.current && nodes.length > 0) {
      initialFitDone.current = true
      setTimeout(() => reactFlowInstance.fitView({ padding: 0.2 }), 50)
    }
  }, [nodes.length, reactFlowInstance])

  // Handle new connection: replace existing edge from same source handle
  const onConnect: OnConnect = useCallback((params) => {
    setEdges((eds) => {
      // Remove any existing edge from the same source + sourceHandle
      const filtered = eds.filter(
        (e) =>
          !(e.source === params.source && (e.sourceHandle ?? null) === (params.sourceHandle ?? null))
      )
      return addEdge({ ...params, animated: true } as Edge, filtered)
    })
  }, [setEdges])

  // Sync canvas changes → steps (debounced)
  const syncToSteps = useCallback((currentNodes: Node[], currentEdges: Edge[]) => {
    suppressSync.current = true
    const newSteps = flowToSteps(currentNodes, currentEdges)
    onStepsChange(newSteps)
  }, [onStepsChange])

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes)
    // If nodes are deleted, sync after state update
    const hasDeletion = changes.some(c => c.type === 'remove')
    if (hasDeletion) {
      const deletedIds = new Set(
        changes.filter(c => c.type === 'remove').map(c => c.id)
      )
      // Clear selection if deleted
      if (deletedIds.has(selectedNode || '')) {
        setSelectedNode(null)
        onSelectStep?.(null)
      }
      // Wait for state update then sync
      setTimeout(() => {
        setNodes(currentNodes => {
          setEdges(currentEdges => {
            syncToSteps(currentNodes, currentEdges)
            return currentEdges
          })
          return currentNodes
        })
      }, 0)
    }
  }, [onNodesChange, syncToSteps, setNodes, setEdges, selectedNode, onSelectStep])

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChange(changes)
    const hasDeletion = changes.some(c => c.type === 'remove')
    if (hasDeletion) {
      setTimeout(() => {
        setNodes(currentNodes => {
          setEdges(currentEdges => {
            syncToSteps(currentNodes, currentEdges)
            return currentEdges
          })
          return currentNodes
        })
      }, 0)
    }
  }, [onEdgesChange, syncToSteps, setNodes, setEdges])

  const handleConnectEnd = useCallback(() => {
    // After connect, sync edges
    setTimeout(() => {
      setNodes(currentNodes => {
        setEdges(currentEdges => {
          syncToSteps(currentNodes, currentEdges)
          return currentEdges
        })
        return currentNodes
      })
    }, 50)
  }, [syncToSteps, setNodes, setEdges])

  // Node drag stop → reorder steps by Y position
  const handleNodeDragStop = useCallback((_event: React.MouseEvent, _node: Node) => {
    setNodes(currentNodes => {
      setEdges(currentEdges => {
        syncToSteps(currentNodes, currentEdges)
        return currentEdges
      })
      return currentNodes
    })
  }, [syncToSteps, setNodes, setEdges])

  // Node click → select
  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node.id)
    onSelectStep?.(node.id)
  }, [onSelectStep])

  // Pane click → deselect
  const handlePaneClick = useCallback(() => {
    setSelectedNode(null)
    onSelectStep?.(null)
  }, [onSelectStep])

  // Add step
  const handleAddStep = useCallback((type: CommandStep['type']) => {
    const step = createEmptyStep(type)
    const newSteps = [...stepsRef.current, step]
    onStepsChange(newSteps)
    setSelectedNode(step.id)
    onSelectStep?.(step.id)
    setShowAddMenu(false)
  }, [onStepsChange, onSelectStep])

  // Auto layout
  const handleAutoLayout = useCallback(() => {
    const layoutNodes = autoLayout(nodes)
    setNodes(layoutNodes)
    setTimeout(() => reactFlowInstance.fitView({ padding: 0.2 }), 50)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, setNodes, reactFlowInstance])

  // Fit view
  const handleFitView = useCallback(() => {
    reactFlowInstance.fitView({ padding: 0.2 })
  }, [reactFlowInstance])

  // Update step in property panel
  const selectedStep = useMemo(() => steps.find(s => s.id === selectedNode), [steps, selectedNode])

  const updateSelectedStep = useCallback((updates: Partial<CommandStep>) => {
    if (!selectedNode) return
    const newSteps = steps.map(s => s.id === selectedNode ? { ...s, ...updates } as CommandStep : s)
    onStepsChange(newSteps)
  }, [selectedNode, steps, onStepsChange])


  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev)
  }, [])

  return (
    <div
      className={isFullscreen
        ? 'fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col'
        : 'flex flex-col'}
      style={isFullscreen ? undefined : { height: '100%', minHeight: 600 }}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
        <div className="relative" ref={addMenuRef}>
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs cursor-pointer transition-colors hover:border-[var(--color-primary)]"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            <Plus size={12} /> 添加步骤 <ChevronDown size={10} />
          </button>
          {showAddMenu && (
            <div
              className="absolute left-0 top-full mt-1 z-50 rounded-lg border shadow-lg py-1 min-w-[160px]"
              style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
            >
              {STEP_TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleAddStep(opt.value)}
                  className="block w-full text-left px-3 py-1.5 text-xs cursor-pointer transition-colors hover:bg-[var(--color-bg-secondary)]"
                  style={{ color: 'var(--color-text)' }}
                >
                  {opt.label} <span className="font-mono" style={{ color: 'var(--color-text-muted)' }}>({opt.value})</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={handleAutoLayout}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs cursor-pointer transition-colors hover:border-[var(--color-primary)]"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          <LayoutGrid size={12} /> 自动布局
        </button>
        <button
          onClick={handleFitView}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs cursor-pointer transition-colors hover:border-[var(--color-primary)]"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          <Maximize2 size={12} /> 适应画布
        </button>
        <div className="flex-1" />
        <button
          onClick={toggleFullscreen}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs cursor-pointer transition-colors hover:border-[var(--color-primary)]"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          {isFullscreen ? <><Minimize2 size={12} /> 退出全屏</> : <><Maximize2 size={12} /> 全屏</>}
        </button>
      </div>

      {/* Main area: canvas + property panel */}
      <div className="flex flex-1 min-h-0">
        {/* Canvas */}
        <div className="flex-1 relative" style={{ minHeight: 0 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onConnectEnd={handleConnectEnd}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
            onNodeDragStop={handleNodeDragStop}
            nodeTypes={nodeTypes}
            nodesDraggable={true}
            elementsSelectable={true}
            nodesConnectable={true}
            edgesFocusable={true}
            deleteKeyCode={['Backspace', 'Delete']}
            className="bg-transparent"
          >
            <Background color="var(--color-border)" gap={20} size={1} />
            <Controls
              showInteractive={false}
              style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
            />
            <MiniMap
              nodeColor="#93c5fd"
              maskColor="rgba(200,200,200,0.25)"
              style={{ backgroundColor: '#f8fafc' }}
            />
          </ReactFlow>
        </div>

        {/* Property panel */}
        <div className="w-80 border-l overflow-y-auto" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
          {selectedStep ? (
            <PropertyPanel step={selectedStep} allSteps={steps} onChange={updateSelectedStep} />
          ) : (
            <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--color-text-muted)' }}>
              点击节点编辑属性
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Property Panel ──

function PropertyPanel({ step, allSteps, onChange }: {
  step: CommandStep
  allSteps: CommandStep[]
  onChange: (updates: Partial<CommandStep>) => void
}) {
  const otherSteps = allSteps.filter(s => s.id !== step.id)

  return (
    <div className="p-3 space-y-3">
      <div className="text-xs font-semibold pb-2 border-b" style={{ color: 'var(--color-text)', borderColor: 'var(--color-border)' }}>
        节点属性
      </div>

      {/* Common fields */}
      <div>
        <label className={labelClass} style={labelStyle}>ID</label>
        <input value={step.id} readOnly className={`${inputClass} font-mono opacity-70`} style={inputStyle} />
      </div>
      <div>
        <label className={labelClass} style={labelStyle}>名称</label>
        <input value={step.name || ''} onChange={e => onChange({ name: e.target.value })} placeholder="步骤名称" className={inputClass} style={inputStyle} />
      </div>
      <div>
        <label className={labelClass} style={labelStyle}>错误处理</label>
        <select value={step.onError || 'stop'} onChange={e => onChange({ onError: e.target.value as 'stop' | 'continue' | 'retry' })} className={`${inputClass} cursor-pointer`} style={inputStyle}>
          {ERROR_STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
        <div className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>
          类型: <span className="font-mono" style={{ color: 'var(--color-primary)' }}>{step.type}</span>
        </div>
      </div>

      {/* Type-specific fields */}
      {step.type === 'prompt' && <PromptFields step={step} onChange={onChange as (u: Partial<PromptStep>) => void} />}
      {step.type === 'script' && <ScriptFields step={step} onChange={onChange as (u: Partial<ScriptStep>) => void} />}
      {step.type === 'condition' && <ConditionFields step={step} otherSteps={otherSteps} onChange={onChange as (u: Partial<ConditionStep>) => void} />}
      {step.type === 'parallel' && <ParallelFields step={step} onChange={onChange as (u: Partial<ParallelStep>) => void} />}
      {step.type === 'command-ref' && <CommandRefFields step={step} onChange={onChange as (u: Partial<CommandRefStep>) => void} />}
    </div>
  )
}

// ── Type-specific property fields ──

function PromptFields({ step, onChange }: { step: PromptStep; onChange: (u: Partial<PromptStep>) => void }) {
  return (
    <div className="space-y-2">
      <div>
        <label className={labelClass} style={labelStyle}>System Prompt</label>
        <textarea value={step.systemPrompt || ''} onChange={e => onChange({ systemPrompt: e.target.value })} rows={3} placeholder="系统提示词" className={`${inputClass} resize-y`} style={inputStyle} />
      </div>
      <div>
        <label className={labelClass} style={labelStyle}>User Message *</label>
        <textarea value={step.userMessage} onChange={e => onChange({ userMessage: e.target.value })} rows={3} placeholder="用户消息" className={`${inputClass} resize-y`} style={inputStyle} />
      </div>
      <div>
        <label className={labelClass} style={labelStyle}>工具 (逗号分隔)</label>
        <input
          value={(step.tools || []).join(', ')}
          onChange={e => onChange({ tools: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
          placeholder="Read, Bash"
          className={`${inputClass} font-mono`}
          style={inputStyle}
        />
      </div>
      <div>
        <label className={labelClass} style={labelStyle}>Max Turns</label>
        <input
          type="number"
          value={step.maxTurns ?? ''}
          onChange={e => onChange({ maxTurns: e.target.value ? Number(e.target.value) : undefined })}
          placeholder="默认"
          className={inputClass}
          style={inputStyle}
        />
      </div>
    </div>
  )
}

function ScriptFields({ step, onChange }: { step: ScriptStep; onChange: (u: Partial<ScriptStep>) => void }) {
  return (
    <div className="space-y-2">
      <div>
        <label className={labelClass} style={labelStyle}>命令 *</label>
        <textarea value={step.command} onChange={e => onChange({ command: e.target.value })} rows={2} placeholder="npm run build" className={`${inputClass} font-mono resize-y`} style={inputStyle} />
      </div>
      <div>
        <label className={labelClass} style={labelStyle}>工作目录 (cwd)</label>
        <input value={step.cwd || ''} onChange={e => onChange({ cwd: e.target.value || undefined })} placeholder="." className={`${inputClass} font-mono`} style={inputStyle} />
      </div>
    </div>
  )
}

function ConditionFields({ step, otherSteps, onChange }: {
  step: ConditionStep
  otherSteps: CommandStep[]
  onChange: (u: Partial<ConditionStep>) => void
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className={labelClass} style={labelStyle}>条件表达式 (if) *</label>
        <input value={step.if} onChange={e => onChange({ if: e.target.value })} placeholder="contains(steps.xxx.output, '关键词')" className={`${inputClass} font-mono`} style={inputStyle} />
      </div>
      <div>
        <label className={labelClass} style={labelStyle}>Then (步骤ID)</label>
        <select
          value={Array.isArray(step.then) ? step.then[0] || '' : step.then}
          onChange={e => onChange({ then: e.target.value })}
          className={`${inputClass} cursor-pointer`}
          style={inputStyle}
        >
          <option value="">选择步骤...</option>
          {otherSteps.map(s => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}
        </select>
      </div>
      <div>
        <label className={labelClass} style={labelStyle}>Else (步骤ID)</label>
        <select
          value={step.else ? (Array.isArray(step.else) ? step.else[0] || '' : step.else) : ''}
          onChange={e => onChange({ else: e.target.value || undefined })}
          className={`${inputClass} cursor-pointer`}
          style={inputStyle}
        >
          <option value="">选择步骤...</option>
          {otherSteps.map(s => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}
        </select>
      </div>
    </div>
  )
}

function ParallelFields({ step, onChange }: { step: ParallelStep; onChange: (u: Partial<ParallelStep>) => void }) {
  const branches = step.branches || [[]]
  return (
    <div className="space-y-2">
      <div className="text-xs p-2 rounded" style={{ color: 'var(--color-text-muted)', backgroundColor: 'var(--color-bg-secondary)' }}>
        包含 {branches.length} 个分支。请在表单视图中编辑分支内部步骤。
      </div>
      <div>
        <label className={labelClass} style={labelStyle}>输出变量名</label>
        <input value={step.outputVar || ''} onChange={e => onChange({ outputVar: e.target.value || undefined })} placeholder="parallel_result" className={`${inputClass} font-mono`} style={inputStyle} />
      </div>
    </div>
  )
}

function CommandRefFields({ step, onChange }: { step: CommandRefStep; onChange: (u: Partial<CommandRefStep>) => void }) {
  return (
    <div className="space-y-2">
      <div>
        <label className={labelClass} style={labelStyle}>引用命令 ID *</label>
        <input value={step.commandId} onChange={e => onChange({ commandId: e.target.value })} placeholder="other-command-id" className={`${inputClass} font-mono`} style={inputStyle} />
      </div>
      <div>
        <label className={labelClass} style={labelStyle}>参数 (JSON)</label>
        <textarea
          value={step.params ? JSON.stringify(step.params, null, 2) : ''}
          onChange={e => {
            try {
              const params = e.target.value.trim() ? JSON.parse(e.target.value) : undefined
              onChange({ params })
            } catch {
              // ignore parse errors while typing
            }
          }}
          rows={3}
          placeholder='{"key": "value"}'
          className={`${inputClass} font-mono resize-y`}
          style={inputStyle}
        />
      </div>
    </div>
  )
}

// ── Main export (wrapped in Provider) ──

export default function WorkflowEditor(props: WorkflowEditorProps) {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner {...props} />
    </ReactFlowProvider>
  )
}
