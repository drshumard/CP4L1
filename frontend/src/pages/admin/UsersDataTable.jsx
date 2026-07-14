import React from 'react';
import {
  flexRender, getCoreRowModel, getSortedRowModel, useReactTable,
} from '@tanstack/react-table';
import {
  ArrowUpDown, ChevronLeft, ChevronRight, MoreHorizontalIcon,
  Search, Settings2, SlidersHorizontal,
} from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const COLUMN_LABELS = { created_at: 'Date joined', name: 'Name', email: 'Email' };
const HEADER_GRADIENT = 'linear-gradient(to top, #F8F8F8, #F8F8F899, #00000000)';

function SortHeader({ column, children }) {
  return (
    <Button variant="ghost" className="mx-auto h-8" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
      {children}
      <ArrowUpDown className="ml-1.5 size-3.5 text-muted-foreground" />
    </Button>
  );
}

function pageList(page, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, '…', total];
  if (page >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '…', page - 1, page, page + 1, '…', total];
}

export default function UsersDataTable({
  users = [], totalUsers, search, onSearchChange,
  page, totalPages, onPageChange,
  onView, onResend, formatDate, getStepLabel, stepBadgeClass,
  settingsActive, onToggleSettings,
}) {
  const [sorting, setSorting] = React.useState([]);
  const [columnVisibility, setColumnVisibility] = React.useState({});

  const columns = React.useMemo(() => [
    {
      accessorKey: 'created_at',
      header: ({ column }) => <SortHeader column={column}>Date joined</SortHeader>,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(row.original.created_at)}</span>
      ),
    },
    {
      accessorKey: 'name',
      header: ({ column }) => <SortHeader column={column}>Name</SortHeader>,
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name || 'Unknown'}</span>,
    },
    {
      accessorKey: 'email',
      header: ({ column }) => <SortHeader column={column}>Email</SortHeader>,
      cell: ({ row }) => <span className="text-foreground">{row.original.email}</span>,
    },
    {
      id: 'status',
      header: () => <span>Status</span>,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-1.5">
          <Badge variant="outline" className={cn('w-24 justify-center', stepBadgeClass?.(row.original.current_step))}>{getStepLabel(row.original.current_step)}</Badge>
          {row.original.role === 'admin' && <Badge className="justify-center">Admin</Badge>}
        </div>
      ),
    },
    {
      id: 'actions',
      header: () => <span>Actions</span>,
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreHorizontalIcon />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onView(row.original)}>View details</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onResend?.(row.original)}>Send access email</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { try { navigator.clipboard?.writeText(row.original.email || ''); } catch { /* noop */ } }}>Copy email</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ], [formatDate, getStepLabel, stepBadgeClass, onView, onResend]);

  const table = useReactTable({
    data: users,
    columns,
    getRowId: (r) => r.id,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
  });

  const pages = pageList(page, totalPages);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search users..." value={search} onChange={(e) => onSearchChange(e.target.value)} className="pl-8" />
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          {onToggleSettings && (
            <Button variant={settingsActive ? 'default' : 'outline'} size="sm" onClick={onToggleSettings}>
              <Settings2 className="size-4" />
              <span className="hidden sm:inline">Settings</span>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <SlidersHorizontal className="size-4" />
                <span className="hidden sm:inline">Columns</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table.getAllColumns().filter((c) => c.getCanHide()).map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  className="capitalize"
                  checked={c.getIsVisible()}
                  onCheckedChange={(v) => c.toggleVisibility(!!v)}
                >
                  {COLUMN_LABELS[c.id] || c.id}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="border-b hover:bg-transparent" style={{ backgroundImage: HEADER_GRADIENT }}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className="h-14 px-6 text-center align-middle text-[13px] font-semibold text-foreground [&>button]:font-semibold">
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} onClick={() => onView(row.original)} className="cursor-pointer">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-6 py-2 text-sm text-center align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer: count + pagination */}
      <div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {users.length} of {typeof totalUsers === 'number' ? totalUsers : users.length} users
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1}>
              <ChevronLeft className="size-4" /> Previous
            </Button>
            {pages.map((p, i) => (p === '…' ? (
              <span key={`gap-${i}`} className="px-1 text-muted-foreground">…</span>
            ) : (
              <Button key={p} variant={p === page ? 'default' : 'outline'} size="sm" className="w-9" onClick={() => onPageChange(p)}>
                {p}
              </Button>
            )))}
            <Button variant="outline" size="sm" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}>
              Next <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
