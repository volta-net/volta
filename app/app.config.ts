export default defineAppConfig({
  ui: {
    colors: {
      primary: 'blue',
      success: 'emerald',
      important: 'indigo',
      neutral: 'zinc'
    },
    slideover: {
      slots: {
        header: 'sm:px-4',
        body: 'sm:p-4'
      }
    },
    empty: {
      defaultVariants: {
        variant: 'naked',
        size: 'lg'
      }
    },
    prose: {
      p: {
        base: 'my-4'
      },
      blockquote: {
        base: '[&>p]:my-0'
      }
    },
    editor: {
      slots: {
        base: [
          '*:my-4',
          '[&_p:not([data-placeholder]):has(>br.ProseMirror-trailingBreak:only-child)]:hidden',
          '[&_a]:cursor-pointer',
          '[&_h1]:text-xl',
          '[&_h2]:text-xl',
          '[&_h3]:text-lg',
          '[&_h4]:text-base',
          '[&_[data-type=horizontalRule]]:my-0',
          // Details
          '[&_.details]:relative [&_.details]:border [&_.details]:border-default [&_.details]:rounded-md [&_.details]:bg-elevated/50 [&_.details]:overflow-hidden',
          '[&_.details>button]:absolute [&_.details>button]:top-0 [&_.details>button]:left-0 [&_.details>button]:right-0 [&_.details>button]:h-10 [&_.details>button]:cursor-pointer [&_.details>button]:z-10',
          '[&_.details_summary]:list-none [&_.details_summary]:font-medium [&_.details_summary]:text-highlighted [&_.details_summary]:flex [&_.details_summary]:items-center [&_.details_summary]:gap-2 [&_.details_summary]:px-4 [&_.details_summary]:py-2.5 [&_.details_summary]:before:content-["▶"] [&_.details_summary]:before:text-dimmed [&_.details_summary]:before:text-[10px] [&_.details_summary]:before:transition-transform [&_.details_summary]:before:duration-200 [&_.details_summary]:before:shrink-0',
          '[&_.details.is-open_summary]:before:rotate-90',
          '[&_[data-type="detailsContent"]]:px-4 [&_[data-type="detailsContent"]]:py-3 [&_[data-type="detailsContent"]]:border-t [&_[data-type="detailsContent"]]:border-default [&_[data-type="detailsContent"]>*:first-child]:mt-0 [&_[data-type="detailsContent"]>*:last-child]:mb-0',
          // Tables
          '[&_.tableWrapper]:overflow-x-auto',
          '[&_table]:w-full [&_table]:border-separate [&_table]:border-spacing-0 [&_table]:rounded-md',
          '[&_th]:py-3 [&_th]:px-4 [&_th]:font-semibold [&_th]:text-sm [&_th]:text-left [&_th]:bg-muted/50 [&_th]:border-t [&_th]:border-b [&_th]:border-e [&_th]:first:border-s [&_th]:border-muted',
          '[&_th_p]:my-0 [&_th_p]:leading-5',
          '[&_td]:py-3 [&_td]:px-4 [&_td]:text-sm [&_td]:text-left [&_td]:border-b [&_td]:border-e [&_td]:first:border-s [&_td]:border-muted',
          '[&_td_p]:my-0 [&_td_p]:leading-5 [&_td_code]:text-xs/5 [&_td_ul]:my-0 [&_td_ol]:my-0 [&_td_ul]:ps-4.5 [&_td_ol]:ps-4.5 [&_td_li]:leading-6 [&_td_li]:my-0.5',
          '[&_tr:first-child_th:first-child]:rounded-tl-md [&_tr:first-child_th:last-child]:rounded-tr-md [&_tr:last-child_td:first-child]:rounded-bl-md [&_tr:last-child_td:last-child]:rounded-br-md',
          '[&_.selectedCell]:bg-primary/10 [&_.selectedCell]:ring-2 [&_.selectedCell]:ring-primary [&_.selectedCell]:ring-inset',
          // Task lists
          '[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:ps-1',
          '[&_ul[data-type=taskList]_li]:flex [&_ul[data-type=taskList]_li]:items-center [&_ul[data-type=taskList]_li]:ps-0',
          '[&_ul[data-type=taskList]_li_label]:inline-flex [&_ul[data-type=taskList]_li_label]:pr-2.5',
          '[&_ul[data-type=taskList]_li_label_input]:appearance-none [&_ul[data-type=taskList]_li_label_input]:size-4 [&_ul[data-type=taskList]_li_label_input]:rounded-sm [&_ul[data-type=taskList]_li_label_input]:ring [&_ul[data-type=taskList]_li_label_input]:ring-inset [&_ul[data-type=taskList]_li_label_input]:ring-accented [&_ul[data-type=taskList]_li_label_input]:bg-center',
          '[&_ul[data-type=taskList]_li_label_input:checked]:bg-primary [&_ul[data-type=taskList]_li_label_input:checked]:ring-primary [&_ul[data-type=taskList]_li_label_input:checked]:bg-[url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNCIgaGVpZ2h0PSIxNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjMiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTIwIDZMOSAxN2wtNS01Ii8+PC9zdmc+)] dark:[&_ul[data-type=taskList]_li_label_input:checked]:bg-[url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNCIgaGVpZ2h0PSIxNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImJsYWNrIiBzdHJva2Utd2lkdGg9IjMiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTIwIDZMOSAxN2wtNS01Ii8+PC9zdmc+)]',
          '[&_ul[data-type=taskList]_li[data-checked=true]>div>p]:line-through [&_ul[data-type=taskList]_li[data-checked=true]>div>p]:opacity-50'
        ]
      }
    },
    toast: {
      slots: {
        close: 'p-0.5'
      }
    },
    dashboardPanel: {
      slots: {
        root: 'min-h-[calc(100svh-2rem)]',
        body: 'sm:p-4 sm:gap-4'
      }
    },
    dashboardSidebar: {
      slots: {
        header: 'h-12'
      },
      variants: {
        menu: {
          true: {
            header: 'sm:px-4',
            body: 'sm:px-4',
            footer: 'sm:px-4'
          }
        }
      }
    },
    dashboardNavbar: {
      slots: {
        root: 'sm:px-4 h-12'
      }
    },
    dashboardToolbar: {
      slots: {
        root: 'sm:px-4'
      }
    }
  }
})
