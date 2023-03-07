DROP TABLE IF EXISTS Listings;
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