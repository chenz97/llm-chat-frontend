'use client';

import { useId, type CSSProperties, type ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

// Keep dragged items moving only along the list direction.
const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });

interface SortableListProps<T extends { id: string }> {
  items: T[];
  disabled?: boolean;
  className?: string;
  itemClassName?: string;
  getItemLabel: (item: T) => string;
  onReorder: (activeId: string, overId: string) => void;
  // `dragHandle` is a ready-to-place grip button; omit it to make an item non-draggable.
  renderItem: (item: T, dragHandle: ReactNode) => ReactNode;
}

export default function SortableList<T extends { id: string }>({
  items,
  disabled = false,
  className,
  itemClassName,
  getItemLabel,
  onReorder,
  renderItem,
}: SortableListProps<T>) {
  const dndContextId = useId();
  const sensors = useSensors(
    // A small distance threshold keeps plain clicks on the handle from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onReorder(String(active.id), String(over.id));
  };

  return (
    <DndContext
      id={dndContextId}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
        disabled={disabled}
      >
        <div className={className}>
          {items.map((item) => (
            <SortableRow
              key={item.id}
              id={item.id}
              label={getItemLabel(item)}
              className={itemClassName}
            >
              {(dragHandle) => renderItem(item, dragHandle)}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

interface SortableRowProps {
  id: string;
  label: string;
  className?: string;
  children: (dragHandle: ReactNode) => ReactNode;
}

function SortableRow({ id, label, className, children }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  };

  const dragHandle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Drag to reorder ${label}`}
      title="Drag to reorder"
      className="flex-shrink-0 touch-none rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <GripVertical className="w-4 h-4" />
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${className ?? ''} ${isDragging ? 'shadow-lg ring-2 ring-blue-200' : ''}`}
    >
      {children(dragHandle)}
    </div>
  );
}
