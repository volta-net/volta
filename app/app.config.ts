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
    editor: {
      slots: {
        base: [
          '*:my-4',
          '[&_h1]:text-xl',
          '[&_h2]:text-xl',
          '[&_h3]:text-lg',
          '[&_h4]:text-base',
          '[&_[data-type=horizontalRule]]:my-0',
          '[&_.details]:border [&_.details]:border-default [&_.details]:rounded-md [&_.details]:bg-elevated/50 [&_.details]:overflow-hidden',
          '[&_.details]:relative',
          '[&_.details>button]:absolute [&_.details>button]:top-0 [&_.details>button]:left-0 [&_.details>button]:right-0 [&_.details>button]:h-10 [&_.details>button]:cursor-pointer [&_.details>button]:z-10',
          '[&_.details_summary]:list-none [&_.details_summary]:font-medium [&_.details_summary]:text-highlighted',
          '[&_.details_summary]:flex [&_.details_summary]:items-center [&_.details_summary]:gap-2 [&_.details_summary]:px-4 [&_.details_summary]:py-2.5',
          '[&_.details_summary]:before:content-["▶"] [&_.details_summary]:before:text-dimmed [&_.details_summary]:before:text-[10px] [&_.details_summary]:before:transition-transform [&_.details_summary]:before:duration-200 [&_.details_summary]:before:shrink-0',
          '[&_.details.is-open_summary]:before:rotate-90',
          '[&_[data-type="detailsContent"]]:px-4 [&_[data-type="detailsContent"]]:py-3 [&_[data-type="detailsContent"]]:border-t [&_[data-type="detailsContent"]]:border-default',
          '[&_[data-type="detailsContent"]>*:first-child]:mt-0 [&_[data-type="detailsContent"]>*:last-child]:mb-0'
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
