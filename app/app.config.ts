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
    dashboardNavbar: {
      slots: {
        root: 'sm:px-4'
      }
    }
  }
})
