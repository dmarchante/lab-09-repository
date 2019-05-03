'use strict';

// Application Dependencies
const express = require('express');
const superagent = require('superagent');
const cors = require('cors');
const pg = require('pg');

// Load environment variables from .env file
require('dotenv').config();

// Application Setup
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Database Setup
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();

// API Routes
app.get('/location', (request, response) => {
  searchToLatLong(request.query.data)
    .then(location => response.send(location))
    .catch(error => handleError(error, response));
});

app.get('/weather', getWeather);
app.get('/events', getEvents);
app.get('/movies', getMovies);


// Make sure the server is listening for requests
app.listen(PORT, () => console.log(`Listening on ${PORT}`));

// Error handler
function handleError(err, res) {
  console.error(err);
  if (res) res.status(500).send('Sorry, something went wrong');
}

// Models
function Location(query, res) {
  this.search_query = query;
  this.formatted_query = res.body.results[0].formatted_address;
  this.latitude = res.body.results[0].geometry.location.lat;
  this.longitude = res.body.results[0].geometry.location.lng;
}

function Weather(day) {
  this.forecast = day.summary;
  this.formatted_date = new Date(day.time * 1000).toString().slice(0, 15);
}

function Event(event) {
  this.link = event.url;
  this.event_name = event.name.text;
  this.event_date = new Date(event.start.local).toString().slice(0, 15);
  this.summary = event.summary;
}

function Movies(movie) {
  this.title = movie.title;
  this.overview = movie.overview;
  this.average_votes = movie.vote_average;
  this.total_votes = movie.vote_count;
  this.image_url = movie.poster_path;
  this.popularity = movie.popularity;
  this.released_on = movie.released_date;
}

function searchToLatLong(query) {
  let sqlStatement = 'SELECT * FROM locations WHERE search_query = $1';
  let values = [query];

  return client.query(sqlStatement, values)
    .then((data) => {
      if (data.rowCount > 0) {
        return data.rows[0];
      } else {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;

        return superagent.get(url)
          .then(res => {
            let newLocation = new Location(query, res);
            let insertStatement = 'INSERT INTO locations (formatted_query, latitude, longitude, search_query)  VALUES ($1, $2, $3, $4)';
            let insertValues = [newLocation.formatted_query, newLocation.latitude, newLocation.longitude, newLocation.search_query];

            client.query(insertStatement, insertValues)
              .then(pgResponse => {
                newLocation.id = pgResponse.rows[0].id;
                return newLocation;
              });

            return newLocation;
          })
          .catch(error => handleError(error));
      }
    });
}

function getWeather(request, response) {
  getData('weather', request, response);
}

function getEvents(request, response) {
  getData('events', request, response);
}

function getMovies(request, response) {
  getData('movies', request, response);
}

let timeouts = {
  weather: 15000,
  event: 30000
};

function getData(table, request, response) {
  let sqlStatement = `SELECT * FROM ${table} WHERE location_id = $1`;
  let values = [request.query.data.id];

  return client.query(sqlStatement, values)
    .then((data) => {
      if (data.rowCount > 0) {
        let dateCreatedTime = data.rows[0].created_at;
        let now = Date.now();

        if (table === 'weather') {
          if (now - dateCreatedTime > timeouts.weather) {
            //delete old data
            let deleteStatement = `DELETE FROM ${table} WHERE location_id = $1`;

            client.query(deleteStatement, values)
              .then(() => {
                getFreshWeatherData(request, response);
              });
          } else {
            response.send(data.rows);
          }
        } else if (table === 'events') {
          if (now - dateCreatedTime > timeouts.events) {
            //delete old data
            let deleteStatement = `DELETE FROM ${table} WHERE location_id = $1`;

            client.query(deleteStatement, values)
              .then(() => {
                getFreshEventData(request, response);
              });
          } else {
            response.send(data.rows);
          }
        } else if (table === 'movies') {
          if (now - dateCreatedTime > timeouts.events) {
            //delete old data
            let deleteStatement = `DELETE FROM ${table} WHERE location_id = $1`;

            client.query(deleteStatement, values)
              .then(() => {
                getFreshMovieData(request, response);
              });
          } else {
            response.send(data.rows);
          }
        }
      } else {
        getFreshWeatherData(request, response);
        getFreshEventData(request, response);
        getFreshMovieData(request, response);
      }
    });
}

function getFreshWeatherData(request, response) {
  const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${request.query.data.latitude},${request.query.data.longitude}`;

  return superagent.get(url)
    .then(result => {
      const weatherSummaries = result.body.daily.data.map(day => {
        let newWeather = new Weather(day);
        let insertStatement = 'INSERT INTO weather (forecast, formatted_date, created_at, location_id)  VALUES ($1, $2, $3, $4)';
        let insertValues = [newWeather.forecast, newWeather.formatted_date, Date.now(), request.query.data.id];
        client.query(insertStatement, insertValues);

        return newWeather;
      });

      response.send(weatherSummaries);
    })
    .catch(error => handleError(error, response));
}

function getFreshEventData(request, response) {
  const eventLocation = request.query.data.search_query;
  const url = `https://www.eventbriteapi.com/v3/events/search?token=${process.env.EVENTBRITE_API_KEY}&location.address=${eventLocation}`;

  return superagent.get(url)
    .then(result => {
      const events = result.body.events.map(eventData => {
        let newEvent = new Event(eventData);
        let insertStatement = 'INSERT INTO events (link, event_name, event_date, summary, created_at, location_id)  VALUES ($1, $2, $3, $4, $5, $6)';
        let insertValues = [newEvent.link, newEvent.event_name, newEvent.event_date, newEvent.summary, Date.now(), request.query.data.id];
        client.query(insertStatement, insertValues);

        return newEvent;
      });
      response.send(events);
    })
    .catch(error => handleError(error, response));
}

function getFreshMovieData(request, response) {
  const movieLocation = request.query.data.search_query;
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIE_API_KEY}&query=J${request.query.data.search_query}`;

  console.log(url);

  return superagent.get(url)
    .then(result => {
      const movies = result.body.results.map(movieData => {
        let newMovie = new Movies(movieData);
        let insertStatement = 'INSERT INTO movies (title, overview, average_votes, total_votes, image_url, popularity, released_on, created_at, location_id)  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)';
        let insertValues = [newMovie.title, newMovie.overview, newMovie.average_votes, newMovie.total_votes,newMovie.image_url, newMovie.popularity, newMovie.released_on, Date.now(), request.query.data.id];

        client.query(insertStatement, insertValues);

        return newMovie;
      });
      response.send(movies);
    })
    .catch(error => handleError(error, response));
}
