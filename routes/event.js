const express = require('express');
const router  = express.Router();
const { addEvent, addDate, addUserGuest, getIdFromEmail, getStartEnd, pickDate, updateNameByUserId, makeAvailable, notAvailable, DeleteVote, getVoteCount, creatorId, getEventIdWithUserId, checkIfVoted, getUserInfoWithEventId , getNameByUserId} = require('../lib/queries.js');
const { sendMail, sendResultEmail } = require('../nodemailer/mailFunctions')

module.exports = (db) => {

  // GET Routes

  router.get('/:id/poll/', async (req,res) => {
    let auth = req.params.id;
    const name = await getNameByUserId(auth, db)
    console.log(name)
    await getStartEnd(auth, db)
    .then(result => {
      let templateVars = {dates: result, user_id: auth, name: name }
      res.render('poll', templateVars);
    });
  });

  const addCounts = (arr) => {
    let output = [];
    arr.forEach(date =>{
      date['yes_count'] = '0';
      date['no_count'] = '0';
      output.push(date)
    });
    console.log(output);
    return output;
  }

  router.get('/:id/pollResult', async (req, res) => {
    let user_id = req.params.id;
    let event_id = await getEventIdWithUserId(user_id, db);
    let vote = await checkIfVoted(event_id, db);
    let creator_id = await creatorId(event_id, db);

    if(user_id === creator_id && vote == 0){
        user_id = undefined
        getStartEnd(creator_id, db)
        .then(result => {
          let newDates = addCounts(result);
          console.log(newDates)
          let templateVars = {dates: newDates, user_id, yes_count: '0', no_count: '0', creator_id }
          return res.render('pollResult', templateVars);
        });
    } else if (user_id === creator_id) {
        user_id = undefined
        getVoteCount(creator_id, db)
        .then( results => {
          let templateVars = {dates: results, user_id, creator_id}
          return res.render('pollResult', templateVars);
        })
    } else {
      getVoteCount(user_id, db)
      .then( results => {
        let templateVars = {dates: results, user_id }
        return res.render('pollResult', templateVars);
      })
    }
  });


  router.get('/:id/dates', (req, res) =>{
    // get event
    let id = req.params.id;
    db.query('SELECT * FROM events WHERE id = $1', [id])
      .then(result => {
        let event = result.rows[0];
        let templateVars = {title: event.title, duration: event.duration, id: event.id};
        return res.render('dates', templateVars);
      })
      .catch(err => {
        res.json({error: err.message});
      });
  });

  //POST Routes

  router.post('/', (req, res) =>{
    const { title, description, duration, name, email } = req.body;
    let event = {title, description, duration};
    let user = { name, email};

    return addEvent(event, user, db).then(result => {
      const id = result.rows[0].event_id;
      return res.redirect(`/event/${id}/dates`);
    });

  });

  router.post('/date', (req, res) => {
    let date = req.body.date;
    let id = req.body.id;

    addDate(id, date, db)
    .then(result => {})
    .catch(err => {
      res.json({error: err.message});
    });
  });

  router.post('/users', (req, res) => {
    let event_id = req.headers.referer.slice(28, 64);
    let users = req.body;
    let emails = Object.values(users);
    emails.forEach(email => {
      addUserGuest(event_id, email, db)
      .then(results => getIdFromEmail(event_id, results.rows[0].email, db))
      .then(response => {
        let email = response.email
        let user_id = response.user_id
        sendMail(email, user_id)
      });
    });
    creatorId(event_id, db)
    .then(result => res.redirect(`/event/${result}/pollResult`));
  });

  router.post('/:id/poll', (req, res) => {
    let dates = req.body;
    let { name } = req.body;
    let user_id = req.params.id;
    updateNameByUserId(name, user_id, db)
    .then(result => console.log(result));

    for(const date in dates){
      DeleteVote(date, user_id, db);
      if(dates[date] == 1){
        makeAvailable(date, user_id, db);
      }
      else if(dates[date] == 0){
        notAvailable(date, user_id, db);
      }
    }
    res.redirect(`/event/${user_id}/pollResult`);
  });

  router.post('/:id/close', async(req, res) => {
    let user_id = req.params.id
    let eventId = await getEventIdWithUserId(user_id, db)
    let date = await pickDate(user_id, db)
    getUserInfoWithEventId(eventId, db)
    .then(result => {
      result.forEach(user => {
        name = user.name;
        email = user.email;
        id = user.id;
        sendResultEmail(email, name, date.title, date.start_time, date.description, id)
      })
    })
    res.redirect(`/event/${user_id}/close`);
  });

  router.get('/:id/close', async (req,res) =>{
    let user_id = req.params.id;
    let result = await pickDate(user_id, db);
    const eventId = await getEventIdWithUserId(user_id, db);
    const users = await getUserInfoWithEventId(eventId, db);
    result.users = [];
    users.forEach(user => {
      result.users.push(user.name)
    })

    res.render('result', { result })

  });




  // Catch All Route

  router.get('*', (req, res) => {
    res.render('index');
  });



  return router;
};


