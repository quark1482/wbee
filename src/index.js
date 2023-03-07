const vrboURL='https://www.vrbo.com';

const defaultPageSize = 50;

const searchRequestGraphQL = 'query SearchRequestQuery($request:SearchResultRequest!){results:search(request:$request){fromRecord toRecord page pageSize pageCount resultCount listings{status listingNumber detailPageUrl propertyName propertyType headline description images{c6_uri c9_uri} bathrooms{full half toiletOnly} bedrooms spaces{spacesSummary{bedCountDisplay bedroomCountDisplay bathroomCountDisplay}} sleeps petsAllowed amenities{title attributes} address{city country postalCode} priceSummary{formattedAmount pricePeriodDescription} averageRating reviewCount reviews{reviewer{nickname} title text} houseRules{checkIn checkOut} geoCode{latitude longitude}}}}';

export default {
    async fetch(request, env) {
        try {
            const reqURL = new URL(request.url);
            const input = reqURL.searchParams.get('location');
            const count = reqURL.searchParams.get('count');
            if ('/' !== reqURL.pathname) {
                throw new Error(`Path '${reqURL.pathname}' not found`, { cause: 404 });
            } else if (!input) {
                throw new Error(`Missing parameter 'location'`, { cause: 400 });
            }
            if ('GET' !== request.method) {
                throw new Error(`Method ${request.method} not allowed`, { cause: 405 });
            }
            const resSuggestion = await getLocationSuggestion(input);
            if (!resSuggestion.status) {
                throw new Error(resSuggestion.message, { cause: resSuggestion.code });
            }
            const resSearch =  await sendSearchRequest(resSuggestion.location, 1, count);
            if (!resSearch.status) {
                throw new Error(resSearch.message, { cause: resSearch.code });
            }
            const resSave = await saveResults(env.DB, resSearch.results);
            if (!resSave.status) {
                throw new Error(resSave.message, { cause: 500 });
            }
            return new Response(
                JSON.stringify({ results: resSearch.results }),
                { headers: { 'Content-Type': 'application/json' }, status: 200 }
            );
        } catch (err) {
            return new Response(
                JSON.stringify({ error: err.message }),
                { headers: { 'Content-Type': 'application/json' }, status: err.cause }
            );
        }
    }
}

function getListingDetails(l) {
    const ret = {
        id: 0,
        url: '',
        name: '',
        description: '',
        type: '',
        details: {
            beds: 0,
            bedrooms: 0,
            bathrooms: 0,
            guests: 0
        },
        price: {
            value: '',
            qualifier: ''
        },
        rating: 0,
        amenities: [],
        photos: [],
        location: {
            lat: 0,
            lng: 0
        }
    };
    ret.id = isNaN(l.listingNumber) ? 0 : l.listingNumber;
    ret.url = l.detailPageUrl || '';
    if (ret.url) {
        if (-1 == ret.url.indexOf(vrboURL)) {
            ret.url = vrboURL + ret.url;
        }
    }
    ret.name = l.headline || '';
    ret.description = l.description || '';
    ret.type = l.propertyType || '';
    if (l.spaces.spacesSummary) {
        ret.details.beds = parseInt(l.spaces.spacesSummary.bedCountDisplay);
        ret.details.bedrooms = parseInt(l.spaces.spacesSummary.bedroomCountDisplay);
        ret.details.bathrooms = parseInt(l.spaces.spacesSummary.bathroomCountDisplay);
    }
    ret.details.guests = isNaN(l.sleeps) ? 0 : l.sleeps;
    if (l.priceSummary) {
        ret.price.value = l.priceSummary.formattedAmount || '';
        ret.price.qualifier = l.priceSummary.pricePeriodDescription || '';
    }
    ret.rating = isNaN(l.averageRating) ? 0 : l.averageRating;
    if (Array.isArray(l.amenities)) {
        for (const a of l.amenities) {
            if (Array.isArray(a.attributes)) {
                for (const t of a.attributes) {
                    ret.amenities.push(t);
                }
            }
        }
    }
    if (Array.isArray(l.images)) {
        for (const i of l.images) {
            ret.photos.push(i.c6_uri);
        }
    }
    if (l.geoCode) {
        if (!isNaN(l.geoCode.latitude) && !isNaN(l.geoCode.longitude)) {
            ret.location.lat = l.geoCode.latitude;
            ret.location.lng = l.geoCode.longitude;
        }
    }
    return ret;
}

async function getLocationSuggestion(i) {
    let ret = {
        status: false,
        code: 0,
        message: '',
        location: ''
    };
    try {
        const suggestURL = `${vrboURL}/geo/v2/typeahead/suggest?site=vrbo&input=${i}&locale=en_US&_restfully=true`;
        const res = await fetch(suggestURL);
        if (200 != res.status) {
            throw new Error(`Unexpected response code: ${res.status}`, { cause: 500 });
        } else if (-1 == res.headers.get('content-type').indexOf('application/json')) {
            throw new Error(`Unexpected content type: ${res.headers.get('content-type')}`, { cause: 500 });
        }
        const json = await res.json();
        if (!Array.isArray(json.suggestions)) {
            throw new Error('Unexpected content: malformed JSON', { cause: 500 });
        } else if (!json.suggestions.length) {
            throw new Error('Unexpected content: suggestions array came empty', { cause: 500 });
        } else if (!json.suggestions[0].place) {
            throw new Error('Unexpected content: suggestion place came empty', { cause: 500 });
        } else if (!json.suggestions[0].place.fullName) {
            throw new Error('Unexpected content: place name came empty', { cause: 500 });
        }
        ret.status = true;
        ret.code = 200;
        ret.location = json.suggestions[0].place.fullName;
    } catch (err) {
        ret.code = err.cause;
        ret.message = err.message;
    }
    return ret;
}

function makeSearchRequest(q, p, s) {
    const ret = {
        operationName: 'SearchRequestQuery',
        variables: {
            request: {
                paging: {
                    page: p,
                    pageSize: s
                },
                q: q
            }
        },
        query: searchRequestGraphQL
    };
    return JSON.stringify(ret);
}

async function saveResults(db, r) {
    let ret = {
        status: false,
        message: ''
    };
    const insert = 'Insert Into Listings(' +
                       'ListingId,URL,Name,Description,Type,'+
                       'Beds,Bedrooms,Bathrooms,Guests,Price,'+
                       'Rating,Amenities,Photos,Location'+
                   ') Values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
    try {
        await db.prepare('Delete From Listings').run();
        let transactions = [];
        for (const l of r) {
            const i = db.prepare(insert).bind(
                l.id,
                l.url,
                l.name,
                l.description,
                l.type,
                l.details.beds,
                l.details.bedrooms,
                l.details.bathrooms,
                l.details.guests,
                JSON.stringify({ value: l.price.value, qualifier: l.price.qualifier }),
                l.rating,
                JSON.stringify(l.amenities),
                JSON.stringify(l.photos),
                JSON.stringify({ lat: l.location.lat, lng: l.location.lng })
            );
            transactions.push(i);
        }
        await db.batch(transactions);
        ret.status = true;
    } catch (err) {
        if (err.cause.message) {
            ret.message = err.cause.message;
        } else {
            ret.message = err.message;
        }
    }
    return ret;
}

async function sendSearchRequest(q, p, s) {
    let ret = {
        status: false,
        code: 0,
        message: '',
        results: []
    };
    p = isNaN(p) ? 1 : Number(p) || 1;
    s = isNaN(s) ? defaultPageSize : Number(s) || defaultPageSize;
    try {
        const options = {
            method: 'POST',
            body: makeSearchRequest(q, p, s),
            headers: {
                'content-type': 'application/json'
            }
        };
        const searchURL = `${vrboURL}/serp/g`;
        const res = await fetch(searchURL, options);
        if (200 != res.status) {
            throw new Error(`Unexpected response code: ${res.status}`, { cause: 500 });
        } else if (-1 == res.headers.get('content-type').indexOf('text/html')) {
            throw new Error(`Unexpected content type: ${res.headers.get('content-type')}`, { cause: 500 });
        }
        const json = await res.json();
        if (Array.isArray(json.errors)) {
            throw new Error(json.errors[0].message, { cause: 400 });
        }
        if (!Array.isArray(json.data.results.listings)) {
            throw new Error('Unexpected content: malformed JSON', { cause: 500 });
        }
        for (const l of json.data.results.listings) {
            ret.results.push(getListingDetails(l));
        }
        ret.status = true;
        ret.code = 200;
    } catch (err) {
        ret.code = err.cause;
        ret.message = err.message;
    }
    return ret;
}