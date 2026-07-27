import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

function App() {
  const [goals, setGoals] = useState([])
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchGoals()
  }, [])

  async function fetchGoals() {
    setLoading(true)
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) console.error(error)
    else setGoals(data)
    setLoading(false)
  }

  async function addGoal(e) {
    e.preventDefault()
    if (!title.trim()) return
    const { error } = await supabase.from('goals').insert({ title })
    if (error) console.error(error)
    else {
      setTitle('')
      fetchGoals()
    }
  }

  async function toggleProven(goal) {
    const { error } = await supabase
      .from('goals')
      .update({ status: goal.status === 'proven' ? 'active' : 'proven' })
      .eq('id', goal.id)
    if (error) console.error(error)
    else fetchGoals()
  }

  async function deleteGoal(id) {
    const { error } = await supabase.from('goals').delete().eq('id', id)
    if (error) console.error(error)
    else fetchGoals()
  }

  return (
    <div className="app">
      <h1>Prove It</h1>
      <p className="tagline">Set a goal. Prove you can do it.</p>

      <form onSubmit={addGoal} className="add-form">
        <input
          type="text"
          placeholder="What are you going to prove?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit">Add</button>
      </form>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <ul className="goal-list">
          {goals.map((goal) => (
            <li key={goal.id} className={goal.status === 'proven' ? 'proven' : ''}>
              <span onClick={() => toggleProven(goal)}>{goal.title}</span>
              <button className="delete-btn" onClick={() => deleteGoal(goal.id)}>
                x
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default App
