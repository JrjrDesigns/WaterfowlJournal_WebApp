interface LogoProps {
  className?: string
}

export function LogoIcon({ className = 'h-8 w-auto' }: LogoProps) {
  return <img src="/brand/logo-icon.svg" alt="Blind Guide" className={className} />
}

export function LogoStacked({ className = 'h-24 w-auto' }: LogoProps) {
  return <img src="/brand/logo-stacked.svg" alt="Blind Guide" className={className} />
}

export function LogoLandscape({ className = 'h-8 w-auto' }: LogoProps) {
  return <img src="/brand/logo-landscape.svg" alt="Blind Guide" className={className} />
}
