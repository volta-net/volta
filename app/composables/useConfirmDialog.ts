import { ConfirmDialog } from '#components'

export interface ConfirmDialogOptions {
  title: string
  description?: string
  icon?: string
  color?: 'primary' | 'error' | 'warning' | 'success' | 'neutral'
  confirmLabel?: string
  cancelLabel?: string
}

export function useConfirmDialog() {
  const overlay = useOverlay()

  return (options: ConfirmDialogOptions): Promise<boolean> => {
    const modal = overlay.create(ConfirmDialog, {
      destroyOnClose: true,
      props: options
    })

    return modal.open()
  }
}
