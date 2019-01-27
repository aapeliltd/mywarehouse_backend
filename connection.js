const mysql = require('mysql')

 /*const db = mysql.createConnection({
    host : 'localhost',
    user : 'root',
    password : '',
    database : 'mywarehouse'
});
*/ 



const db = mysql.createConnection({
    host: '185.106.120.58',
    user: 'root_james',
    password: 'OPVNzfoM',
    database: 'root_myware'
});





//connect
db.connect((err) => {
    if (err)
        throw err;
    console.log('Mysql connected...');

})

module.exports = db;