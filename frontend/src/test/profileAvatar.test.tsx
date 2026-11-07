import { expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ProfileAvatar } from '@/components/layout/ProfileAvatar'

it('renders the profile photo and falls back to initials if it fails', () => {
  render(<ProfileAvatar name="Morgan Example" imageUrl="https://img.clerk.com/avatar.png" />)
  const photo = screen.getByRole('img', { name: "Morgan Example's profile photo" })
  expect(photo).toHaveAttribute('src', 'https://img.clerk.com/avatar.png')
  fireEvent.error(photo)
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.getByText('ME')).toBeVisible()
})

it('shows a newly updated photo after an earlier URL failed', () => {
  const view = render(<ProfileAvatar name="Morgan Example" imageUrl="https://img.clerk.com/old.png" />)
  fireEvent.error(screen.getByRole('img'))
  view.rerender(<ProfileAvatar name="Morgan Example" imageUrl="https://img.clerk.com/new.png" />)
  expect(screen.getByRole('img')).toHaveAttribute('src', 'https://img.clerk.com/new.png')
})
