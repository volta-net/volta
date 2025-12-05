export default defineAppConfig({
  ui: {
    colors: {
      primary: 'blue',
      neutral: 'zinc'
    },
    dashboardPanel: {
      slots: {
        root: 'min-h-[calc(100svh-2rem)]'
      }
    },
    dashboardSidebar: {
      slots: {
        header: 'lg:h-12'
      }
    },
    dashboardNavbar: {
      slots: {
        root: 'sm:px-4 h-12'
      }
    }
  }
})
