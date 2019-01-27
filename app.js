const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const routes = require('./api');
const path = require('path');

const app = express();

app.use(express.static(path.join(__dirname, '../mywarehouse/dist'))); // but production, you many have use nginx

/*if(process.env.NODE_ENV = 'production') {
    //nginx
}else {
    //use local
}
*/

//const port = 8000; //for productions

const port = process.env.port || 1234; //localhost  
app.set('port', port);

//middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({
    extended: true
}));

// load our api routes
app.use('/', routes);

app.get('*', (req, res) => {
    return res.sendFile(path.join(__dirname, '../mywarehouse/dist/index.html'));
})


app.listen(port);
//console.log('running... at 185.106.120.58:'+port);