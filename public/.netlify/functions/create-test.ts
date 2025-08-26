import { neon } from '@netlify/neon';

const sql = neon(); // This will work in Netlify Functions

export async function handler(event, context) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { 
      testKey, 
      testName, 
      testDescription, 
      startDate, 
      startTime, 
      duration, 
      timeLimit, 
      randomizeQuestions, 
      allowReview, 
      showCorrectAnswers,
      questions 
    } = JSON.parse(event.body);

    // Save questions to database
    const savedQuestions = [];
    for (const question of questions) {
      const [existingQuestion] = await sql`
        SELECT id FROM questions 
        WHERE text = ${question.text} AND topic = ${question.topic}
      `;
      
      if (existingQuestion) {
        savedQuestions.push(existingQuestion);
      } else {
        const [newQuestion] = await sql`
          INSERT INTO questions (text, topic, options, correct_answer)
          VALUES (${question.text}, ${question.topic}, ${JSON.stringify(question.options)}, ${question.correctAnswer})
          RETURNING id
        `;
        savedQuestions.push(newQuestion);
      }
    }

    // Insert test into database
    const [newTest] = await sql`
      INSERT INTO tests (
        test_key, name, description, start_date, start_time, 
        duration, time_limit, randomize_questions, allow_review, show_correct_answers
      )
      VALUES (
        ${testKey}, ${testName}, ${testDescription}, 
        ${startDate}, ${startTime}, ${duration}, ${timeLimit}, 
        ${randomizeQuestions}, ${allowReview}, ${showCorrectAnswers}
      )
      RETURNING id, test_key
    `;

    // Link questions to test
    for (let i = 0; i < savedQuestions.length; i++) {
      await sql`
        INSERT INTO test_questions (test_id, question_id, order_index)
        VALUES (${newTest.id}, ${savedQuestions[i].id}, ${i})
      `;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        testKey: newTest.test_key,
        testId: newTest.id 
      })
    };
  } catch (error) {
    console.error('Error creating test:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to create test' })
    };
  }
}
