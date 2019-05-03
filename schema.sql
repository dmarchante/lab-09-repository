DROP TABLE IF EXISTS locations, weather, events;

CREATE TABLE locations (
  id SERIAL PRIMARY KEY, 
  formatted_query VARCHAR(255),
  latitude NUMERIC,
  longitude NUMERIC,
  search_query VARCHAR(255)
);

CREATE TABLE weather (
  -- id SERIAL PRIMARY KEY, 
  forecast VARCHAR(255),
  formatted_date DATE,
  created_at BIGINT,
  location_id INTEGER NOT NULL REFERENCES locations(id) 
);

CREATE TABLE events (
  -- id SERIAL PRIMARY KEY, 
  link VARCHAR (255),
  event_name VARCHAR(255),
  event_date DATE,
  summary VARCHAR (255),
  created_at BIGINT,
  location_id INTEGER NOT NULL REFERENCES locations(id) 
);