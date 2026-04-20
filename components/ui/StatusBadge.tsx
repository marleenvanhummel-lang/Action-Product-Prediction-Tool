type Status = 'pass' | 'fail' | 'warning' | 'error' | 'pending' | 'skipped'

const CONFIG: Record<Status, { label: string; className: string }> = {
  pass: { label: 'Pass', className: 'bg-green-100 text-green-800 border-green-200' },
  fail: { label: 'Fail', className: 'bg-red-100 text-red-800 border-red-200' },
  warning: { label: 'Warning', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  error: { label: 'Error', className: 'bg-gray-100 text-gray-600 border-gray-200' },
  pending: { label: 'Pending', className: 'bg-blue-50 text-blue-600 border-blue-200' },
  skipped: { label: 'Skipped', className: 'bg-gray-50 text-gray-400 border-gray-100' },
}

interface Props {
  status: Status
  label?: string
  size?: 'sm' | 'md'
}

export default function StatusBadge({ status, label, size = 'sm' }: Props) {
  const config = CONFIG[status]
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
  return (
    <span className={`inline-flex items-center font-medium rounded-full border ${sizeClass} ${config.className}`}>
      {label ?? config.label}
    </span>
  )
}
