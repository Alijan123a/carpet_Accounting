import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

/** True when an "outside" interaction actually hit a typeahead dropdown portal. */
function isTypeaheadPortalEvent(e: { target: EventTarget | null }): boolean {
  return e.target instanceof Element && e.target.closest('[data-typeahead-portal]') != null
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    {/*
      Center the dialog within the CONTENT AREA, not the whole window. The app
      shell has a fixed 16rem (w-64) sidebar on the start side, so centering on
      the full viewport makes every dialog hug the sidebar with a big gap on the
      other side. We pad the start by the sidebar width (+1rem gutter) and use a
      flexbox center, so dialogs sit centred in the usable workspace in both RTL
      and LTR. `pointer-events-none` lets clicks in the empty area fall through
      to Radix's dismiss layer; the content re-enables its own pointer events.
    */}
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center py-4 pe-4 ps-4 sm:ps-[calc(16rem+1rem)]">
      <DialogPrimitive.Content
        ref={ref}
        // The Typeahead dropdown is portaled to <body> (so scroll containers can't
        // clip it); clicks inside it must not count as "outside" and close the dialog.
        onPointerDownOutside={(e) => {
          if (isTypeaheadPortalEvent(e)) e.preventDefault()
        }}
        onInteractOutside={(e) => {
          if (isTypeaheadPortalEvent(e)) e.preventDefault()
        }}
        className={cn(
          'pointer-events-auto relative grid max-h-[calc(100vh-2rem)] w-full max-w-lg gap-4 overflow-y-auto rounded-2xl border border-border/70 bg-card p-6 shadow-card-hover duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute end-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </div>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn('flex flex-col gap-1.5 text-start', className)} {...props} />
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />
}

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription
}
