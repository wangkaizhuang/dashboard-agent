'use client'
interface TypewriterTextProps {
  text: string
  isComplete?: boolean
  className?: string
}
export function TypewriterText({ text, isComplete = false, className = '' }: TypewriterTextProps) {
  return (
    <span className={`${className} ${!isComplete ? 'typewriter-cursor' : ''}`}>
      {text}
    </span>
  )
}
