import { insertQuestions } from '../lib/database'

const sampleQuestions = [
  {
    text: "What is the capital of France?",
    options: ["London", "Berlin", "Paris", "Madrid"],
    correctAnswer: 2,
    topic: "Geography"
  },
  {
    text: "Which programming language is known for 'Write Once, Run Anywhere'?",
    options: ["Python", "Java", "C++", "JavaScript"],
    correctAnswer: 1,
    topic: "Programming"
  },
  {
    text: "What is 2 + 2?",
    options: ["3", "4", "5", "6"],
    correctAnswer: 1,
    topic: "Mathematics"
  },
  {
    text: "Who wrote 'Romeo and Juliet'?",
    options: ["Charles Dickens", "William Shakespeare", "Jane Austen", "Mark Twain"],
    correctAnswer: 1,
    topic: "Literature"
  },
  {
    text: "What is the largest planet in our solar system?",
    options: ["Earth", "Mars", "Jupiter", "Saturn"],
    correctAnswer: 2,
    topic: "Science"
  },
  // Add more questions here...
]

export const populateDatabase = async () => {
  try {
    console.log('Inserting questions...')
    const result = await insertQuestions(sampleQuestions)
    console.log(`Successfully inserted ${result.length} questions`)
    return result
  } catch (error) {
    console.error('Failed to populate database:', error)
    throw error
  }
}

export default populateDatabase;

// Run this function once to populate your database
// You can call this from a component or create a script
