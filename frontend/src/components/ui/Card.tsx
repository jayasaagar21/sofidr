import React from "react"

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function Card({ className = "", ...props }: CardProps) {
  return <div className={`card ${className}`} {...props} />
}
