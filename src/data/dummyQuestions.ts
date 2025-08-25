import type { Question } from "../types";


export const dummyQuestions: Question[] = [
  {
    id: '1',
    text: 'What is the capital of France?',
    options: ['London', 'Berlin', 'Paris', 'Madrid'],
    correctAnswer: 2,
    topic: 'Geography'
  },
  {
    id: '2',
    text: 'Which planet is known as the Red Planet?',
    options: ['Venus', 'Mars', 'Jupiter', 'Saturn'],
    correctAnswer: 1,
    topic: 'Science'
  },
  {
    id: '3',
    text: 'Who wrote "To be or not to be"?',
    options: ['Charles Dickens', 'William Shakespeare', 'Jane Austen', 'Mark Twain'],
    correctAnswer: 1,
    topic: 'Literature'
  },
  {
    id: '4',
    text: 'What is 2 + 2?',
    options: ['3', '4', '5', '6'],
    correctAnswer: 1,
    topic: 'Mathematics'
  },
  {
    id: '5',
    text: 'Which is the largest ocean on Earth?',
    options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'],
    correctAnswer: 3,
    topic: 'Geography'
  },
  {
    id: '6',
    text: 'What is the chemical symbol for water?',
    options: ['H2O', 'CO2', 'NaCl', 'O2'],
    correctAnswer: 0,
    topic: 'Science'
  },
  {
    id: '7',
    text: 'In which year did World War II end?',
    options: ['1944', '1945', '1946', '1947'],
    correctAnswer: 1,
    topic: 'History'
  },
  {
    id: '8',
    text: 'What is the square root of 64?',
    options: ['6', '7', '8', '9'],
    correctAnswer: 2,
    topic: 'Mathematics'
  },
  {
    id: '9',
    text: 'Who painted the Mona Lisa?',
    options: ['Vincent van Gogh', 'Pablo Picasso', 'Leonardo da Vinci', 'Michelangelo'],
    correctAnswer: 2,
    topic: 'Art'
  },
  {
    id: '10',
    text: 'Which gas do plants absorb from the atmosphere?',
    options: ['Oxygen', 'Nitrogen', 'Carbon Dioxide', 'Hydrogen'],
    correctAnswer: 2,
    topic: 'Science'
  },
  {
    id: '11',
    text: 'What is the longest river in the world?',
    options: ['Amazon', 'Nile', 'Yangtze', 'Mississippi'],
    correctAnswer: 1,
    topic: 'Geography'
  },
  {
    id: '12',
    text: 'Who invented the telephone?',
    options: ['Thomas Edison', 'Alexander Graham Bell', 'Nikola Tesla', 'Benjamin Franklin'],
    correctAnswer: 1,
    topic: 'History'
  },
  {
    id: '13',
    text: 'What is 15% of 200?',
    options: ['25', '30', '35', '40'],
    correctAnswer: 1,
    topic: 'Mathematics'
  },
  {
    id: '14',
    text: 'Which Shakespeare play features the character Hamlet?',
    options: ['Macbeth', 'Romeo and Juliet', 'Hamlet', 'Othello'],
    correctAnswer: 2,
    topic: 'Literature'
  },
  {
    id: '15',
    text: 'What is the hardest natural substance on Earth?',
    options: ['Gold', 'Iron', 'Diamond', 'Silver'],
    correctAnswer: 2,
    topic: 'Science'
  }
];
export default dummyQuestions;