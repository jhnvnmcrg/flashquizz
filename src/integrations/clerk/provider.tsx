import { ClerkProvider } from '@clerk/tanstack-react-start'

export default function AppClerkProvider({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      afterSignOutUrl="/sign-in"
      appearance={{
        variables: {
          colorPrimary: 'oklch(0.52 0.12 162)',
          fontFamily: "'Atkinson Hyperlegible Next Variable', ui-sans-serif, system-ui, sans-serif",
          borderRadius: '0.75rem',
        },
      }}
    >
      {children}
    </ClerkProvider>
  )
}
