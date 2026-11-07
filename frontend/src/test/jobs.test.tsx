import { expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { JobsView } from '@/components/dashboard/JobsView'
const state=vi.hoisted(()=>({jobs:[{id:'one',title:'Backend Engineer',department:'Engineering',location:'Remote',description_raw:'Build Python services'}],selectedJob:null,openJobWorkspace:vi.fn(),setSelectedJob:vi.fn(),isLoadingJobs:false,jobError:null}))
vi.mock('@/context/JobContext',()=>({useJob:()=>state}))
vi.mock('@/services/api',()=>({api:{rankCandidates:vi.fn().mockRejectedValue(new Error('unavailable'))}}))
it('keeps unavailable data unknown and filters jobs without losing workspace navigation',async()=>{
 const user=userEvent.setup()
 render(<JobsView onCreate={vi.fn()}/> )
 expect(screen.getByText('Status unknown')).toBeVisible()
 expect(screen.getByLabelText('Resumes: unknown')).toBeVisible()
 expect(await screen.findByText('Unknown')).toBeVisible()
 await user.click(screen.getByRole('button',{name:'Open workspace'}))
 expect(state.openJobWorkspace).toHaveBeenCalledWith(state.jobs[0])
 await user.type(screen.getByLabelText('Search jobs'),'Designer')
 expect(screen.getByText('No jobs match your filters.')).toBeVisible()
 await user.clear(screen.getByLabelText('Search jobs'))
 await user.click(screen.getByRole('button',{name:'Draft (0)'}))
 expect(screen.queryByRole('heading',{name:'Backend Engineer'})).not.toBeInTheDocument()
})
