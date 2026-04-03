'use client';

import { useState } from 'react';
import { Plus, ChevronLeft, ChevronRight, Check } from 'lucide-react';

// Mock 数据类型
interface Todo {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
  checked: boolean;
}

interface Note {
  id: string;
  title: string;
  content: string;
  time: string;
}

// 初始 Mock 数据
const initialTodos: Todo[] = [
  { id: '1', title: '完成周报整理', status: 'pending', checked: false },
  { id: '2', title: '审核项目方案', status: 'in_progress', checked: false },
  { id: '3', title: '准备部门会议材料', status: 'pending', checked: false },
];

const initialNotes: Note[] = [
  { id: '1', title: '会议纪要 - 产品评审', content: '讨论了新版本的功能优先级...', time: '2小时前' },
  { id: '2', title: '技术方案备忘', content: '关于微服务架构的几个关键决策点...', time: '昨天' },
  { id: '3', title: '周计划', content: '本周重点推进三个核心模块的开发...', time: '3天前' },
];

// 状态标签颜色映射
const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
};

const statusLabels: Record<string, string> = {
  pending: '待处理',
  in_progress: '进行中',
  completed: '已完成',
};

// ========== 待办任务区 ==========
function SidebarFocusSection() {
  const [todos, setTodos] = useState<Todo[]>(initialTodos);

  const handleToggle = (id: string) => {
    setTodos((prev) =>
      prev.map((todo) =>
        todo.id === id
          ? {
              ...todo,
              checked: !todo.checked,
              status: !todo.checked ? 'completed' : todo.status === 'completed' ? 'pending' : todo.status,
            }
          : todo
      )
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 任务卡片 */}
      <div className="bg-white/30 dark:bg-white/5 backdrop-blur-md rounded-2xl border border-white/40 dark:border-white/[0.06] p-4 shadow-sm flex flex-col gap-3">
        {/* 副标题行 */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            即将到来的任务
          </span>
          <span className="text-xs font-medium text-purple-600 cursor-pointer hover:underline">
            查看全部
          </span>
        </div>

        {/* 任务列表 */}
        {todos.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-2">暂无待办</p>
        ) : (
          todos.map((todo) => (
            <label
              key={todo.id}
              className="flex items-center gap-3 cursor-pointer group"
            >
              {/* 复选框 */}
              <button
                onClick={() => handleToggle(todo.id)}
                className={`
                  w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all
                  ${todo.checked
                    ? 'bg-purple-600 border-purple-600'
                    : 'border-gray-300 dark:border-gray-600 hover:border-purple-400'
                  }
                `}
              >
                {todo.checked && <Check className="w-3 h-3 text-white" />}
              </button>

              {/* 任务内容 */}
              <div className="flex-1 flex items-center justify-between min-w-0">
                <span
                  className={`text-sm text-gray-900 dark:text-white font-medium truncate transition-all ${
                    todo.checked ? 'line-through opacity-50' : 'group-hover:text-purple-600'
                  }`}
                >
                  {todo.title}
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ml-2 shrink-0 ${
                    statusColors[todo.checked ? 'completed' : todo.status]
                  }`}
                >
                  {statusLabels[todo.checked ? 'completed' : todo.status]}
                </span>
              </div>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

// ========== 近期笔记区 ==========
function SidebarNotesSection() {
  const [notes] = useState<Note[]>(initialNotes);

  return (
    <div className="flex flex-col gap-4">
      {/* 标题行 */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          📝 近期笔记
        </h2>
        <button className="text-purple-600 hover:opacity-80 text-xs font-medium bg-purple-100 dark:bg-purple-500/20 px-2 py-1 rounded-md transition-colors flex items-center gap-1">
          <Plus className="w-4 h-4" />
          添加笔记
        </button>
      </div>

      {/* 笔记列表 */}
      <div className="flex flex-col gap-2">
        {notes.length === 0 ? (
          <div className="bg-white/30 dark:bg-white/5 backdrop-blur-md border border-white/40 dark:border-white/[0.06] rounded-2xl p-3 text-xs text-gray-400 text-center">
            暂无笔记
          </div>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className="bg-white/30 dark:bg-white/5 backdrop-blur-md border border-white/40 dark:border-white/[0.06] rounded-2xl p-3 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {note.title}
                </span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0 ml-2">
                  {note.time}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                {note.content}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ========== 迷你日历 ==========
function MiniCalendar() {
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());

  const today = new Date();
  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  // 获取月份信息
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

  // 构建日历网格
  const cells: { day: number; isCurrentMonth: boolean; isToday: boolean }[] = [];

  // 上月尾部日期
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, isCurrentMonth: false, isToday: false });
  }

  // 当月日期
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday =
      d === today.getDate() &&
      currentMonth === today.getMonth() &&
      currentYear === today.getFullYear();
    cells.push({ day: d, isCurrentMonth: true, isToday });
  }

  // 下月开头日期（补齐6行）
  const remainingCells = 42 - cells.length;
  for (let d = 1; d <= remainingCells; d++) {
    cells.push({ day: d, isCurrentMonth: false, isToday: false });
  }

  // 月份切换
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  return (
    <div className="mt-auto bg-white/30 dark:bg-white/5 backdrop-blur-md rounded-2xl border border-white/40 dark:border-white/[0.06] p-4 shadow-sm flex flex-col gap-2">
      {/* 头部：年月 + 箭头 */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">
          {currentYear}年 {monthNames[currentMonth]}
        </span>
        <div className="flex gap-1">
          <button
            onClick={handlePrevMonth}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={handleNextMonth}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 周标题 */}
      <div className="grid grid-cols-7 text-center text-xs text-gray-400 dark:text-gray-500 mb-1">
        {weekDays.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      {/* 日期网格 */}
      <div className="grid grid-cols-7 text-center text-xs font-medium gap-y-1">
        {cells.map((cell, idx) => (
          <span
            key={idx}
            className={`
              py-1 cursor-pointer transition-colors
              ${!cell.isCurrentMonth ? 'opacity-30' : ''}
              ${cell.isToday
                ? 'bg-purple-600 text-white rounded-full'
                : 'hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded-full'
              }
            `}
          >
            {cell.day}
          </span>
        ))}
      </div>
    </div>
  );
}

// ========== 主组件 ==========
export default function FocusPanel() {
  return (
    <div className="flex flex-col gap-6 p-6 overflow-y-auto h-full">
      <SidebarFocusSection />
      <SidebarNotesSection />
      <MiniCalendar />
    </div>
  );
}
