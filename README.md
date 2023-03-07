# WBee - Worker Bee
Cloudflare worker for scraping listings from vrbo.com.


Features
--------

* Makes use of the undocumented vrbo.com API on GraphQL.
* Extracts a given number of listings for a specific location.
* Stores the listing details in a Cloudflare's D1 database.
* Returns a simplified JSON response with the relevant data.


Installation
------------

### Pre-requisites:

1. [npm](https://nodejs.org/en/download/).
2. [git](https://git-scm.com/downloads).
3. [a Cloudflare account](https://dash.cloudflare.com/sign-up).

### @ dash.cloudflare.com:

* Click on Workers
* Create a subdomain (choose an unique name - let's say its 'my-subdomain')
* Create a service (enter 'wbee' as service name)
* Test the service by clicking on Preview.
<br>It should go to ` https://wbee.my-subdomain.workers.dev `,
<br>which shows a simple 'Hello world' message.

### @ shell/command-line:

* `npm install -g wrangler`
* `cd` to any directory where you want to put the worker in.
    - `git clone https://github.com/quark1482/wbee`
    - `cd wbee`
    - `npm install`
    - `wrangler login`
    - `wrangler d1 create wbee`
    <br>*Copy the database_id. Let's say its '2ba86d35-c3e1-6a21-db83-e963b4789720'.*
    - `echo 'name = "wbee"' > wrangler.toml`
    - `echo 'main = "src/index.js"' >> wrangler.toml`
    - `echo 'compatibility_date = "2023-03-07"' >> wrangler.toml`
    - `echo '[[ d1_databases ]]' >> wrangler.toml`
    - `echo 'binding = "DB"' >> wrangler.toml`
    - `echo 'database_name = "wbee"' >> wrangler.toml`
    - `echo 'database_id = "2ba86d35-c3e1-6a21-db83-e963b4789720"' >> wrangler.toml`
    <br>*Use the database_id value from the previous wrangler command.*
    - `wrangler publish`
    <br>Browsing to ` https://wbee.my-subdomain.workers.dev ` at this time, should show
    <br>something like `{"error":"Missing parameter 'location'"}`, and it's fine.
    - `wrangler d1 execute wbee --file=./schema.sql`

### Testing the worker:

* Browse to ` https://wbee.my-subdomain.workers.dev?location=boston&count=10 `.
<br>Location can be a full name, like 'boston, massachusetts, united states'.
<br>Invalid locations should show `{"error":"Unexpected content: suggestions array came empty"}`.
<br>The parameter 'count' is optional and its default value is 50.
<br>Count is a 'maximum possible'. There could be fewer results for small cities.
* @ dash.cloudflare.com, click to Workers, and then on D1.
    - The database 'wbee' is now visible. Click on its name.
    - 'Listings' appears in the list of tables. Click on it.
    <br>*The table is being cleared on every worker request, to save resources.*
    <br>*Remove the 'Delete From' instruction in the function 'saveResults()'*
    <br>*located in './src/index.js' to avoid this behavior, and publish the worker again.*


Results
-------

The response JSON includes a simplified array of listing details, which is pretty fast to gather,
<br>compared to the vrbo.com API's internal GraphQL query result.

Pay attention to the file ./schema.sql to see how the Listings table is created:

```sql
CREATE TABLE Listings (
    ListingId       INT,
    URL             TEXT,
    Name            TEXT,
    Description     TEXT,
    Type            TEXT,
    Beds            INT,
    Bedrooms        INT,
    Bathrooms       INT,
    Guests          INT,
    Price           TEXT,
    Rating          REAL,
    Amenities       TEXT,
    Photos          TEXT,
    Location        TEXT,
    PRIMARY KEY (ListingId)
);
```

Given their 'composed' nature, the fields Price, Amenities, Photos and Location are stored
<br>as JSON content, to overcome the SQLITE (the D1's underlying database engine) limitations.


<br><br>
_This README file is under construction._