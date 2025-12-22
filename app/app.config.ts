export default defineAppConfig({
  ui: {
    colors: {
      primary: 'blue',
      success: 'emerald',
      important: 'purple',
      neutral: 'zinc'
    },
    slideover: {
      slots: {
        header: 'sm:px-4',
        body: 'sm:p-4'
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
