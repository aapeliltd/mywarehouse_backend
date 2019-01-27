const express = require("express");
const db = require("./connection");
const jwt = require("jsonwebtoken");
const Joi = require("joi");
const crypto = require('crypto');
const algorithm = 'aes-256-cbc';
const key = crypto.randomBytes(32);
const iv = crypto.randomBytes(16);
const app = express();

// generic routes
const genericHandler = (req, res, next) => {
  res.json({
    status: "success",
    data: req.body
  });
};



//create new warehouse
app.post("/new-warheouse", genericHandler);

//routes
app.get("/api", (req, res) => {
  res.json({
    message: "Welcom to our new api"
  });
});

//secret ecryption key
const SECRET = "HHSNJShhhj67767=|@@$#==";

//middleware to check if payload is present
const validatePayloadMiddleware = (req, res, next) => {
  if (req.body) next();
  else {
    res.status(403).send({
      message: "You need a payload"
    });
  }
};

//jwt middleware
const jwtMiddleware = (req, res, next) => {
  const authString = req.headers["authorization"];
  if (typeof authString === "string" && authString.indexOf(" ") > -1) {
    const authArray = authString.split(" ");
    const tokens = authArray[1];
    jwt.verify(tokens, SECRET, (err, decoded) => {
      if (err) res.status(403).send({
        message: "Invalid credentitals"
      });
      else {
        req.decoded = decoded;
        next();
      }
    });
  } else {
    res.sendStatus(403);
  }
};

function errorMessage(err, res) {
  console.log(err);
}

//get the total of product as regards to box
app.get('/api/getListBox/:charge_id', jwtMiddleware, (req, res) => {
  var sql = "select sum(credit)-sum(debit) as total, charge_box_id, charge_key, products.name, products.code, products.description  from stocks join products on products.id=stocks.product_id join charge_boxes on charge_boxes.id = stocks.charge_box where stocks.charge_box = ? GROUP BY products.name, products.code, products.description, charge_box_id, charge_key";
  db.query(sql, [req.params.charge_id], (err, boxes_inventories) => {
    if (err) throw err;
    res.send({
      boxes_inventories
    })
  })
})

//get inventory boxes
app.get('/api/getBoxInventory/:company_id', jwtMiddleware, (req, res) => {
  var sql = "select stocks.charge_box, boxes.`name`, charge_boxes.charge_box_id, sum(credit)-sum(debit) as total, DATEDIFF(expired_date,now()) as remain_days from stocks join charge_boxes on charge_boxes.id=stocks.charge_box JOIN boxes on boxes.id=charge_boxes.box_id where charge_boxes.company=? GROUP BY stocks.charge_box, boxes.`name`, charge_boxes.charge_box_id";
  db.query(sql, [req.params.company_id], (err, inventories) => {
    res.send({
      inventories
    })
  })
})

// get dashboard sales
app.get('/api/getSalesDashboard/:company_id', jwtMiddleware, (req, res) => {
  var sql = "select products.code, products.`name`, products.description, AVG(sale_order_listings.price) as avg, SUM(sale_order_listings.quantity) as total_quantity from sale_order_listings  join sale_orders on sale_orders.id=sale_order_listings.order_id join products on products.id=sale_order_listings.product where sale_order_listings.`status`=1 and sale_orders.company=? GROUP BY products.`name`, products.description order by sale_orders.checked_date desc limit 20"
  var sql_total_sale = "select SUM(sale_order_listings.lineTotal) as total from sale_order_listings  join sale_orders on sale_orders.id=sale_order_listings.order_id  where sale_order_listings.`status`=1 and sale_orders.company= ? and MONTH(expected_delivered_date) = MONTH(CURRENT_DATE()) AND YEAR(sale_orders.expected_delivered_date) = YEAR(CURRENT_DATE())";
  var sql_purchase_orders = "select * from purchase_orders where company=? order by expected_delivered_date desc limit 20";
  var sql_box = "select charge_boxes.charge_box_id, boxes.`name` as box, own_warehouses.`name` as warehouse, own_warehouses.location, DATEDIFF(expired_date,NOW()) as remaining_days, elapsed_days from charge_boxes join own_warehouses on own_warehouses.id=charge_boxes.warehouse_id join boxes on boxes.id=charge_boxes.box_id where company=?  order by elapsed_days desc ";
  db.query(sql, [req.params.company_id], (err, orders) => {
    if (err) throw err;
    db.query(sql_total_sale,[req.params.company_id], (err2, result) => {
      var total_sales = result[0];
      db.query(sql_purchase_orders, [req.params.company_id], (err3, purchase_orders) => {
        if (err3) throw err3;
        db.query(sql_box, [req.params.company_id], (err4, boxes) => {
          if (err4) throw err4;
          res.send({
            orders,
            total_sales,
            purchase_orders,
            boxes
          })
        })

      })
    })

  })
})

// get sale details
app.get('/api/getSaleDetails/:id', jwtMiddleware, (req, res) => {
  var sql = "SELECT * FROM sale_orders where id=" + req.params.id;
  var sql2 = "SELECT * FROM sale_order_listings WHERE order_id=" + req.params.id;

  db.query(sql, (err, result) => {
    if (err) throw err;
    db.query(sql2, (err2, saleListings) => {
      if (err2) throw err2;
      var sales = result[0];
      res.send({
        sales,
        saleListings
      })
    })
  })
})

// get open sale orders
app.get('/api/getOpenSaleOrders/:status', jwtMiddleware, (req, res) => {
  var sql = "SELECT send_warehouse, name, order_no, sale_orders.id, expected_delivered_date, DATEDIFF(expected_delivered_date,NOW()) as remarks FROM sale_orders join vendors on sale_orders.customer_id=vendors.id where sale_orders.`status`=" + req.params.status;
  db.query(sql, (err, result) => {
    if (err) throw err;
    res.send({
      result
    })
  })
})

//send to wahre
app.get('/api/sendWarehouse/:id', jwtMiddleware, (req, res) => {
  var sql = "UPDATE sale_orders SET send_warehouse = 1 WHERE id=" + req.params.id;
  var sql2 = "SELECT * FROM sale_orders WHERE id=" + req.params.id;
  db.query(sql, (err, result) => {
    if (err) throw err;
    db.query(sql2, (err2, result2) => {
      if (err2) throw err2;
      var result = result2[0];
      res.send({
        result
      })
    })
  })
})

//make order fulfilment
app.post('/api/makeOrderFulfilment', jwtMiddleware, (req, res) => {
  var sql = "INSERT INTO sale_orders SET ? ";
  var sql2 = "INSERT INTO sale_order_listings SET  ? ";
  var sqlme = "SELECT * FROM sale_orders where id = ?";
  var data = req.body.sale_order;
  var data2 = req.body.purchase_order;
  if (data.id) {
    //updated
    var sql3 = "UPDATE sale_orders SET ? ";
    var sql4 = "DELETE FROM sale_order_listings WHERE order_id=" + data.id;
    db.query(sql3, data, (err3, result3) => {
      if (err3) throw err3;
      db.query(sql4, (err4, result4) => {
        if (err4) throw err4;
        data2.forEach(function (element) {
          let order = {
            order_id: result.insertId,
            product: element.product,
            price: element.price,
            quantity: element.quantity,
            lineTotal: element.quantity * element.price,
            selectedBox: element.selectedBox,
            created_by: req.body.sale_order.created_by,
            selectedProduct: element.selectedProduct,
            box: element.box,
            qty_recieved: element.qty_recieved,
            status: element.status,
            stock: element.stock
          };
          db.query(sql2, order, (err2, result2) => {
            if (err2) throw err2;
            res.send({
              data
            })
          })
        })
      })
    })

  } else {

    db.query(sql, data, (err, result) => {
      if (err) throw err;
      data2.forEach(function (element) {
        let order = {
          order_id: result.insertId,
          product: element.product,
          price: element.price,
          quantity: element.quantity,
          lineTotal: element.quantity * element.price,
          selectedBox: element.selectedBox,
          created_by: req.body.sale_order.created_by,
          selectedProduct: element.selectedProduct,
          box: element.box,
          qty_recieved: element.qty_recieved,
          status: element.status,
          stock: element.stock
        };
        db.query(sql2, order, (err2, result2) => {
          if (err2) throw err2;
          db.query(sqlme, [result.insertId], (errme, resultme) => {
            if (errme) throw errme
            var data = resultme[0];
            res.send({
              data
            })

          })

        })
      })
    })


  }


})

//confirm pick up
app.post('/api/confirmAcepickup', jwtMiddleware, (req, res) => {
  var sql = "INSERT INTO pickups SET ? ";
  var sql2 = "INSERT INTO wallets SET ? ";

  db.query(sql, req.body, (err, result) => {
    if (err) throw err;
    let wallet = {
      reference: 'acePickup' + result.insertId,
      debit: req.body.amount,
      credit: 0,
      date_in: new Date(),
      company: req.body.company_id,
      bin: result.insertId,
      created_by: req.body.created_by
    }

    db.query(sql2, wallet, (err2, result2) => {
      if (err2) throw err2;
      let Ace = {
        name: "Ace Pick up services",
        amount: req.body.amount,
        paid: true,
      }
      res.send({
        data: Ace
      })
    })

  })
})
//get ace price list
app.get('/api/getAcePriceList', jwtMiddleware, (req, res) => {
  var sql = "SELECT * FROM acecards";
  db.query(sql, (err, results) => {
    if (err) throw err;
    res.send({
      results
    })
  })
})

//confirm personal pickup
app.post('/api/confirmPersonalpickup', jwtMiddleware, (req, res) => {
  //delete the existinc
  var sql = "INSERT INTO pickups SET ? ";
  db.query(sql, req.body, (err, result) => {
    if (err) throw err;
    let Ace = {
      name: "Personal Pick up services",
      amount: 0,
      paid: true,
    }
    res.send({
      data: Ace
    })
  })
})

//confirm pickup
app.post('/api/confirmPickup', jwtMiddleware, (req, res) => {
  var sql = "INSERT INTO pickups SET ? ";
  var sql2 = " INSERT INTO wallets SET ? ";
  db.query(sql, req.body, (err, result) => {
    if (err) throw err;
    let wallet = {
      reference: 'maxPickup' + result.insertId,
      debit: req.body.amount,
      credit: 0,
      date_in: new Date(),
      company: req.body.company_id,
      bin: result.insertId,
      created_by: req.body.created_by
    }
    db.query(sql2, wallet, (err2, result2) => {
      if (err2) throw err2;
      let Ace = {
        name: "Max Pick up services",
        amount: req.body.amount,
        paid: true,
      }
      res.send({
        data: Ace
      })
    })

  })
})

//get product by box
app.get('/api/getBoxProduct/:box_id', jwtMiddleware, (req, res) => {
  var sql = "select products.`name`, product_row_code, products.id from purchase_order_listings join products on products.id = purchase_order_listings.product where box= ?";
  db.query(sql, [req.params.box_id], (err, result) => {
    if (err) throw err;
    res.send({
      result
    })
  })
})

//get total dashboard
app.get('/api/getTotalDashboard/:company', jwtMiddleware, (req, res) => {
  var sql = "select count(*) as total_product  from products where company=" + req.params.company;
  var sql2 = "select count(*) as total_supplier from vendors where vendorCustomer = 1 and company =" + req.params.company; //supplier
  var sql3 = "select count(*) as total_customer from vendors where vendorCustomer = 2 and company =" + req.params.company; //customer
  var sql4 = "select count(*) as total_open_purchase from purchase_orders where  `status` = 0 and company =" + req.params.company;
  var sql5 = "select count(*) as total_closed_purchase from purchase_orders where  `status` = 1 and company =" + req.params.company;

  var sql6 = "select count(*) as total_open_sale from sale_orders where  `status` = 0 and company =" + req.params.company;
  var sql7 = "select count(*) as total_closed_sale from sale_orders where  `status` = 1 and company =" + req.params.company;


  db.query(sql, (err, result) => {
    if (err) throw err;
    var total_product = result[0];
    db.query(sql2, (err2, result2) => {
      if (err2) throw err2;
      var total_supplier = result2[0];
      db.query(sql3, (err3, result3) => {
        if (err3) throw err3;
        var total_customers = result3[0];
        db.query(sql4, (err4, result4) => {
          if (err4) throw err4;
          total_open_purchase = result4[0];
          db.query(sql5, (err5, result5) => {
            if (err5) throw err5;
            var total_closed_purchase = result5[0];
            db.query(sql6, (err6, result6) => {
              if (err6) throw err6;
              var total_open_sale = result6[0];
              db.query(sql7, (err7, result7) => {
                if (err7) throw err7;
                var total_closed_sale = result7[0];
                res.send({
                  total_product,
                  total_supplier,
                  total_customers,
                  total_open_purchase,
                  total_closed_purchase,
                  total_open_sale,
                  total_closed_sale
                })
              })
            })

          })

        })
      })
    })
  })
})

//update logs
app.get('/api/updateLogs/:company', jwtMiddleware, (req, res) => {
  var sql = "update logs set `read` = 1 where company_id=" + req.params.company;
  var sql2 = "select count(*) as total_count from logs where `read` = 0 and company_id=" + req.params.company;
  db.query(sql, (err, result) => {
    if (err) throw err;
    db.query(sql2, (err2, result2) => {
      if (err2) throw err2;
      var log_count = result2[0];
      res.send({
        // result,
        log_count
      })
    })
  })
})

//get logs
app.get('/api/getlogs/:company', jwtMiddleware, (req, res) => {
  var sql = "select * from logs where company_id =" + req.params.company + " order by id desc limit 10";
  var sql2 = "select count(*) as total_count from logs where `read` = 0 and company_id=" + req.params.company;
  db.query(sql, (err, result) => {
    if (err) throw err;
    db.query(sql2, (err2, result2) => {
      if (err2) throw err2;
      var log_count = result2[0];
      res.send({
        result,
        log_count
      })
    })
  })
})

//send message
app.post('/api/sendMessage', jwtMiddleware, (req, res) => {
  var sql = "INSERT INTO send_messages SET ? ";
  var sql2 = " select * from send_messages where notification_id = " + req.body.notification_id + " order by id desc ";
  db.query(sql, req.body, (err2, result2) => {
    if (err2) throw err2;
    db.query(sql2, (err, result) => {
      if (err) throw result;
      res.send({
        result
      })
    })

  })
})

//get client messages
app.get('/api/getClientMessage/:notification_id', jwtMiddleware, (req, res) => {
  var sql = " select * from send_messages where notification_id = " + req.params.notification_id + " order by id desc ";
  db.query(sql, (err, result) => {
    if (err) throw result;
    res.send({
      result
    })
  })
})

//get tracking
app.get('/api/getOpenTracking/:company/:status', jwtMiddleware, (req, res) => {
  var sql = "select purchase_orders.delivered_date, purchase_orders.id, purchase_orders.warehouse, purchase_orders.`status`, purchase_orders.vendor_id as vendor, purchase_orders.total, purchase_orders.send_warehouse,  notifications.id as notification_id, purchase_orders.id as orderid, notifications.remarks, purchase_orders.order_no, purchase_orders.expected_delivered_date, own_warehouses.`name`, (select count(*) as total_count from send_messages where send_messages.notification_id=notifications.id) as total_count from notifications join purchase_orders on purchase_orders.id = notifications.order_id join own_warehouses on own_warehouses.id=purchase_orders.warehouse where purchase_orders.send_warehouse=1 and purchase_orders.status= ? and purchase_orders.company= ? ";

  db.query(sql, [req.params.status, req.params.company], (err, result) => {
    if (err) throw err;
    res.send({
      result
    })
  })

})

//print purchase listings
app.get('/api/getOrderListings2/:purchase_id/', jwtMiddleware, (req, res) => {
  var sql_check = "select * from purchase_orders where id=" + req.params.purchase_id;
  var sql = "select product_row_code, CONCAT(products.`name`,'[',products.`code`, ']') as description, purchase_order_listings.cost, purchase_order_listings.quantity, (purchase_order_listings.cost * purchase_order_listings.quantity) as lineTotal from purchase_order_listings join purchase_orders on purchase_orders.id=purchase_order_listings.order_id join products on products.id = purchase_order_listings.product where purchase_orders.id=?";
  var sql2 = "select product_row_code, CONCAT(products.`name`,'[',products.`code`, ']') as description, purchase_order_listings.cost, purchase_order_listings.quantity, (purchase_order_listings.cost * purchase_order_listings.quantity) as lineTotal, CONCAT(boxes.boxid,'-',charge_boxes.charge_box_id) as boxcode from purchase_order_listings join purchase_orders on purchase_orders.id=purchase_order_listings.order_id join products on products.id = purchase_order_listings.product join charge_boxes on charge_boxes.id=purchase_order_listings.box join boxes on boxes.id=charge_boxes.box_id where purchase_orders.id=?";
  db.query(sql_check, (err, result) => {
    if (err) throw err;
    var check = result[0];
    if (check.send_warehouse == 1) {
      db.query(sql2, [req.params.purchase_id], (err, result) => {
        if (err) throw err;
        res.send({
          result
        })
      })
    } else {
      db.query(sql, [req.params.purchase_id], (err, result) => {
        if (err) throw err;
        res.send({
          result
        })
      })
    }
  })


})

//get selected vendor
app.get('/api/getSelectedVendors/:vendor_id', jwtMiddleware, (req, res) => {
  var sql = "SELECT * FROM vendors WHERE id=" + req.params.vendor_id;
  db.query(sql, (err, result) => {
    if (err) throw err;
    var vendor = result[0];
    res.send({
      vendor
    })
  })
})

//update company profule
app.post('/api/updateCompanyProfile/:company', jwtMiddleware, (req, res) => {
  var sql = "UPDATE companies SET ? WHERE id=" + req.params.company;
  db.query(sql, req.body, (err, result) => {
    if (err) throw err;
    res.send({
      data: 1
    })
  })
})

//get company profile
app.get('/api/getCompanyProfile/:company', jwtMiddleware, (req, res) => {
  var sql = "select * from companies where id=" + req.params.company;
  db.query(sql, (err, result) => {
    if (err) throw err;
    var profile = result[0];
    res.send({
      profile
    })
  })
})

//get order listings
app.get('/api/getOrderListings/:purchase_id', jwtMiddleware, (req, res) => {
  var sql = "select product_code,order_id,created_by, product, cost, quantity, lineTotal, tax, box from purchase_order_listings where order_id = ? ";
  db.query(sql, [req.params.purchase_id], (err, result) => {
    if (err) throw err;
    res.send({
      result
    })
  })
})

//get get purchase order list
app.get('/api/getPurchaseOrderList/:warehouse_id/:company/:status', jwtMiddleware, (req, res) => {
  var sql = "select purchase_orders.delivered_date, purchase_orders.id, purchase_orders.warehouse, purchase_orders.status, order_no, send_warehouse, vendors.id as vendor, purchase_orders.created, expected_delivered_date, total, vendors.name as vendor_name, own_warehouses.name, DATEDIFF(expected_delivered_date,NOW())as elapsed from purchase_orders join vendors on vendors.id=purchase_orders.vendor_id join own_warehouses on own_warehouses.id=purchase_orders.warehouse where warehouse=? and purchase_orders.company=? and purchase_orders.status= ?";
  db.query(sql, [req.params.warehouse_id, req.params.company, req.params.status], (err, result) => {
    if (err) throw err;
    res.send({
      result
    })
  })

})

//get charge box
app.get('/api/getChargeBox/:warehouse_id/:company', jwtMiddleware, (req, res) => {
  var sql = "select boxes.`name`, boxes.boxid, charge_boxes.id, charge_boxes.charge_box_id from charge_boxes join boxes on boxes.id = charge_boxes.box_id where warehouse_id = ? and company = ? and expired_date >= NOW()";
  db.query(sql, [req.params.warehouse_id, req.params.company], (err, result) => {
    if (err) throw err;
    res.send({
      result
    })
  })
})

//send to warehouse
app.get('/api/sendTowarehouse/:id/:total', jwtMiddleware, (req, res) => {
  var sql = "SELECT * FROM purchase_orders where id=" + req.params.id;
  var sql2 = "UPDATE purchase_orders SET total= ? WHERE id = ?";
  var sql3 = "UPDATE purchase_orders SET total= ?, send_warehouse=1 WHERE id = ?";

  db.query(sql, (err, result) => {
    if (err) throw err;
    data = result[0];
    if (data.status == 1) {
      res.send({
        data: 1 // order has been received, changes cannot be made again
      })
    } else if (data.send_warehouse == 1) {
      db.query(sql2, [req.params.total, req.params.id], (err, result) => {
        if (err) throw err;
        res.send({
          data: 2 // it has been sent to warehouse before
        })
      })
    } else {
      db.query(sql3, [req.params.total, req.params.id], (err, result) => {
        res.send({
          data: 3 // fresh
        })
      })
    }
  })

})

//add purchase listings
app.post('/api/addPurchaseListings/:id', jwtMiddleware, (req, res) => {
  var sql = "INSERT INTO purchase_order_listings SET ? ";
  var sql2 = "DELETE FROM purchase_order_listings WHERE order_id=" + req.params.id;
  var sql3 = "SELECT * FROM purchase_orders where id=" + req.params.id;

  db.query(sql3, (err, result) => {
    if (err) throw err;
    data = result[0];
    if (data.status == 1) {
      res.send({
        data: false
      })
    } else {
      db.query(sql2, (err, result) => {
        if (err) throw err;
        req.body.forEach(element => {
          db.query(sql, element, (err, result) => {
            if (err) throw err;
          })
        });
        res.send({
          data: true
        })
      })
    }
  })


})


//get product cost
app.get('/api/getCostPrice/:product', jwtMiddleware, (req, res) => {
  var sql = "select * from products where id=" + req.params.product;
  var sql2 = "select sum(credit) - sum(debit) as total_stock from stocks where product_id=" + req.params.product;
  db.query(sql, (err, result) => {
    if (err) throw err;
    product = result[0];
    db.query(sql2, (err2, result2) => {
      var stock = result2[0];
      res.send({
        product,
        stock
      })
    })

  })
})

//create new purchase order
app.post('/api/updatePurchaseOrder', jwtMiddleware, (req, res) => {
  var sql = "INSERT INTO purchase_orders SET ? ";
  var sql2 = "SELECT * FROM purchase_orders WHERE id= ? ";
  var sql3 = "UPDATE purchase_orders SET ? WHERE id=" + req.body.id;
  var sql4 = "INSERT INTO notifications SET ? ";
  if (req.body.id) {
    //update
    db.query(sql3, req.body, (err, result) => {
      if (err) throw err;
      db.query(sql2, [req.body.id], (err, result) => {
        if (err) throw err;
        order = result[0];
        res.send({
          order
        })
      })
    })
  } else {
    db.query(sql, req.body, (err, result) => {
      if (err) throw err;
      //create notification/message
      var notification = {
        order_status: 1,
        order_id: result.insertId,
        remarks: 'Purchase order created',
      }
      db.query(sql4, notification, (err, result2) => {
        if (err) throw err;
        db.query(sql2, [result.insertId], (err, result) => {
          if (err) throw err;
          order = result[0];
          res.send({
            order
          })
        })
      })

    })
  }

})

//get products
app.get('/api/getproducts/:company', jwtMiddleware, (req, res) => {
  var sql = "SELECT * FROM products WHERE company=" + req.params.company;
  db.query(sql, (err, result) => {
    if (err) throw err;
    res.send({
      result
    })
  })
})

//add product
app.post('/api/addproduct', jwtMiddleware, (req, res) => {
  var sql = "INSERT INTO products SET ? ";
  var sql2 = "SELECT * FROM products WHERE company=" + req.body.company + " order by id desc ";
  var sql3 = "UPDATE products SET ? WHERE id=" + req.body.id;
  if (req.body.id) {
    db.query(sql3, req.body, (err, result2) => {
      if (err) throw err;
      db.query(sql2, (err2, result) => {
        if (err2) throw err2;
        res.send({
          result
        })
      })
    })
  } else {
    db.query(sql, req.body, (err, result2) => {
      if (err) throw err;
      db.query(sql2, (err2, result) => {
        if (err2) throw err2;
        res.send({
          result
        })
      })
    })
  }

})

//get vendor customer
app.get('/api/getVendorCustomers/:id', jwtMiddleware, (req, res) => {
  var sql2 = "SELECT * FROM vendors WHERE vendorCustomer =" + req.params.id + " order by id desc ";
  db.query(sql2, (err, result) => {
    if (err) throw err;
    res.send({
      result
    })
  })
})

//add vendor
app.post('/api/addVendor', jwtMiddleware, (req, res) => {
  var sql = " INSERT INTO vendors SET ? ";
  var sql2 = "SELECT * FROM vendors WHERE vendorCustomer =" + req.body.vendorCustomer + " order by id desc ";
  var sql3 = "UPDATE vendors SET ? WHERE id =" + req.body.id;
  if (req.body.id) {
    db.query(sql3, req.body, (err, result2) => {
      if (err) throw err;
      db.query(sql2, (err2, result) => {
        if (err2) throw err2;
        res.send({
          result
        })
      })
    })
  } else {
    db.query(sql, req.body, (err, result2) => {
      if (err) throw err;
      db.query(sql2, (err2, result) => {
        if (err2) throw err2;
        res.send({
          result
        })
      })
    })
  }

})

//add new warehouse
app.post('/api/addNewWarehouse', jwtMiddleware, (req, res) => {
  var sql = 'INSERT INTO warehouses SET  ?';
  var sql2 = "select * from warehouses where company = ? order by id desc ";
  var sql3 = "UPDATE warehouses SET  ?  WHERE id =" + req.body.id;
  var data = req.body;
  if (data.id) {
    db.query(sql3, data, (err, result2) => {
      if (err) throw err;
      db.query(sql2, [req.body.company], (err2, result) => {
        if (err2) throw err2;
        res.send({
          result
        })
      })
    })
  } else {
    db.query(sql, data, (err, result2) => {
      if (err) throw err;
      db.query(sql2, [req.body.company], (err2, result) => {
        if (err2) throw err2;
        res.send({
          result
        })
      })
    })
  }

})

//add new user susbsription
app.post('/api/addNewSubscriptionAccount', jwtMiddleware, (req, res) => {
  var purchaseBox = {
    email: req.body.email,
    amount: req.body.amount / 100,
    qty: req.body.qty,
    warehouse: req.body.warehouse,
    authorization_code: req.body.authorization_code,
    bank: req.body.bank,
    card_type: req.body.card_type,
    exp_month: req.body.exp_month,
    exp_year: req.body.exp_year,
    last4: req.body.last4,
    brand: req.body.brand,
    customer_code: req.body.customer_code,
    ip_address: req.body.ip_address,
    domain: req.body.domain,
    first_name: req.body.first_name,
    last_name: req.body.last_name,
    paidAt: req.body.paidAt,
    reference: req.body.reference,
    charge_key: req.body.charge_key,
    company: req.body.company,
    bin: req.body.bin,
    useraccount: req.body.useraccount,
  };
  let user = {
    name: req.body.accountName,
    email: req.body.useraccount,
    password: null, //defaualt password for now
    company: req.body.company,
    //role: null
  };

  var subscription = {
    reference: req.body.reference,
    amount: req.body.amount / 100,
    date_in: req.body.paidAt,
    auth_code: req.body.authorization_code,
    card_type: req.body.card_type,
    ip_address: req.body.ip_address,
    bank: req.body.bank,
    company: req.body.company,
    user: req.body.useraccount,
  };

  var defaultPassword = '12345678';

  //send welcome email here with user password
  var sql = "INSERT INTO charges SET ? ";
  var sql2 = "INSERT INTO subscriptions SET ? ";
  var sql3 = "INSERT INTO users SET ? ";
  var sql4 = 'select id, reference, auth_code, amount, started_date, user, end_date, DATEDIFF(end_date, NOW()) as remain_days from subscriptions where company=' + req.body.company + ' order by id desc ';

  db.query(sql, purchaseBox, (err, result5) => {
    if (err) throw err;
    db.query(sql2, subscription, (err2, result2) => {
      if (err2) throw err2;
      bcrypt.hash(defaultPassword, 10, (err3, hash) => {
        if (err3) throw err3;
        user.password = hash;
        db.query(sql3, user, (err4, result4) => {
          if (err4) throw err4;
          db.query(sql4, (err5, result) => {
            res.send({
              result
            })
          })
        })
      })
    })
  })



})

//get subscriptions
app.get('/api/getOtherTransactions2/:company', jwtMiddleware, (req, res) => {
  var sql = 'select id, reference, auth_code, amount, started_date, user, end_date, DATEDIFF(end_date, NOW()) as remain_days from subscriptions where company=' + req.params.company;
  db.query(sql, (err, result) => {
    if (err) throw err;
    res.send({
      result
    })
  })
})

//user price
app.get('/api/userPackagePrice', jwtMiddleware, (req, res) => {
  var sql = "SELECT * FROM user_package_price LIMIT 1";
  db.query(sql, (err, result) => {
    if (err) throw err;
    cost = result[0];
    res.send({
      cost
    })
  })
})

//get wallet balance
app.get('/api/getWalletBalance/:company', jwtMiddleware, (req, res) => {
  var sql = "select  sum(credit) - sum(debit) as walletBal from wallets where company = ?";
  db.query(sql, [req.params.company], (err, result) => {
    if (err) throw err;
    var total = result[0];
    res.send({
      total
    })
  })
})

app.post('/api/payFromWalle3', jwtMiddleware, (req, res) => {
  var sql = " INSERT INTO wallets SET ?";
  var sql2 = "INSERT INTO subscriptions SET ? ";
  var sqlMe = "INSERT INTO transactions_on_boxes(charges_box_id, subscription_id)VALUES(?, ?)";

  var wallet = {
    reference: req.body.reference,
    debit: req.body.debit,
    date_in: req.body.date_in,
    auth_code: req.body.auth_code,
    card_type: req.body.card_type,
    ip_address: req.body.ip_address,
    bank: req.body.bank,
    company: req.body.company
  };
  var subscription = {
    reference: req.body.reference,
    amount: req.body.debit,
    date_in: req.body.date_in,
    auth_code: req.body.auth_code,
    card_type: req.body.card_type,
    ip_address: req.body.ip_address,
    bank: req.body.bank,
    company: req.body.company,
    user: req.body.user,
  };
  db.query(sql, wallet, (err, result) => {
    if (err) throw err;
    db.query(sql2, subscription, (err2, result2) => {
      if (err2) throw err2;
      db.query(sqlMe, [result.insertId, result2.insertId], (err3, result3) => {
        if (err3) throw err3;
        res.send({
          data: 1
        })
      })
    })
  })
})

//pay via from wallet
app.post('/api/payFromWallet', jwtMiddleware, (req, res) => {
  var sql = " INSERT INTO wallets SET ?";
  var sql2 = "INSERT INTO charge_boxes SET ? ";
  var sqlMe = "INSERT INTO transactions_on_boxes(charges_box_id, wallet_charge_id)VALUES(?, ?)";

  var wallet = {
    reference: req.body.reference,
    debit: req.body.debit,
    date_in: req.body.date_in,
    auth_code: req.body.auth_code,
    card_type: req.body.card_type,
    ip_address: req.body.ip_address,
    bank: req.body.bank,
    company: req.body.company
  };
  db.query(sql, wallet, (err, result) => {
    if (err) throw err;
    req.body.box.forEach(element => {
      db.query(sql2, element, (err2, result2) => {
        if (err2) throw err2;
        db.query(sqlMe, [result2.insertId, result.insertId], (err5, result5) => {
          if (err5) throw err5;
        })
      })
    });
    res.send({
      data: 1
    })
  })
})

//get payment for
app.get('/api/getPaymentFor2/:id', jwtMiddleware, (req, res) => {
  var sql = "select own_warehouses.`name` as warehouse, own_warehouses.location, boxes.name as box, boxes.height, boxes.width, boxes.length, boxes.pic, charge_boxes.cost as singleCost, charge_boxes.expired_date, boxes.boxid as boxCode, charge_boxes.charge_box_id as boxSubCode , DATEDIFF(charge_boxes.expired_date, NOW()) as remain_days  from transactions_on_boxes join charge_boxes on charge_boxes.id = transactions_on_boxes.charges_box_id join boxes on boxes.id = charge_boxes.box_id join own_warehouses on own_warehouses.id=boxes.warehouse where transactions_on_boxes.wallet_charge_id = ?";
  db.query(sql, [req.params.id], (err, result) => {
    if (err) throw err;
    res.send({
      result
    })
  })
})

//get payment for
app.get('/api/getPaymentFor/:id', jwtMiddleware, (req, res) => {
  var sql = "select own_warehouses.`name` as warehouse, own_warehouses.location, boxes.name as box, boxes.height, boxes.width, boxes.length, boxes.pic, charge_boxes.cost as singleCost, charge_boxes.expired_date, boxes.boxid as boxCode, charge_boxes.charge_box_id as boxSubCode , DATEDIFF(charge_boxes.expired_date, NOW()) as remain_days  from transactions_on_boxes join charge_boxes on charge_boxes.id = transactions_on_boxes.charges_box_id join boxes on boxes.id = charge_boxes.box_id join own_warehouses on own_warehouses.id=boxes.warehouse where transactions_on_boxes.charges_id = ?";
  db.query(sql, [req.params.id], (err, result) => {
    if (err) throw err;
    res.send({
      result
    })
  })
})

//get the list of other transactions
app.get('/api/getListOfOtherTransactions/:company', jwtMiddleware, (req, res) => {
  var sql = "SELECT * FROM charges WHERE company =? and wallet = 0 ORDER  BY id DESC ";
  db.query(sql, [req.params.company], (err, result) => {
    if (err) throw err;
    res.send({
      result
    })
  })
})

//load subscribed boxes
app.get('/api/loadSubcribedBox/:company', jwtMiddleware, (req, res) => {
  var sql = "select own_warehouses.name as warehouse, own_warehouses.location, own_warehouses.pic as warehouse_pic, own_warehouses.id as warehouse_id, boxes.boxid as bin, boxes.`name` as box, boxes.height, boxes.width, boxes.pic as box_pic, charge_boxes.cost as charge_cost, charge_boxes.date_in as started, charge_boxes.expired_date as end_date, charge_boxes.charge_box_id as box_personal_number, charges.reference, DATEDIFF(charge_boxes.expired_date, NOW()) as remain_days, charge_boxes.id as charge_id, charge_boxes.elapsed_days  from charge_boxes join own_warehouses on own_warehouses.id = charge_boxes.warehouse_id JOIN boxes on boxes.id=charge_boxes.box_id join charges on charges.charge_key = charge_boxes.charge_key where charge_boxes.company = ? ORDER BY charge_boxes.elapsed_days ";
  db.query(sql, [req.params.company], (err, result) => {
    if (err) throw err;
    res.send({
      result
    })
  })
});

// get wallet transactions
app.get('/api/getWalletTransactions/:company', jwtMiddleware, (req, res) => {
  var sql = "SELECT * FROM wallets WHERE company = ? ORDER BY id DESC ";
  db.query(sql, [req.params.company], (err, result3) => {
    if (err) throw err;
    res.send({
      result3
    })
  })
})


//fund wallet
app.post('/api/addReturnCardCharges4', jwtMiddleware, (req, res) => {
  var purchaseBox = {
    email: req.body.email,
    amount: req.body.amount / 100,
    qty: req.body.qty,
    warehouse: req.body.warehouse,
    authorization_code: req.body.authorization_code,
    bank: req.body.bank,
    card_type: req.body.card_type,
    exp_month: req.body.exp_month,
    exp_year: req.body.exp_year,
    last4: req.body.last4,
    brand: req.body.brand,
    customer_code: req.body.customer_code,
    ip_address: req.body.ip_address,
    domain: req.body.domain,
    first_name: req.body.first_name,
    last_name: req.body.last_name,
    paidAt: req.body.paidAt,
    reference: req.body.reference,
    charge_key: req.body.charge_key,
    company: req.body.company,
    wallet: 2,
    bin: req.body.bin,
  };

  var subscription = {
    reference: req.body.reference,
    amount: req.body.amount / 100,
    date_in: req.body.paidAt,
    auth_code: req.body.authorization_code,
    card_type: req.body.card_type,
    last4: req.body.last4,
    ip_address: req.body.ip_address,
    bank: req.body.bank,
    company: req.body.company,
    bin: req.body.bin,
    user: req.body.user,
  };

  var sql1 = "INSERT INTO charges SET ? ";
  var sql2 = "INSERT INTO subscriptions SET ? ";
  var sql3 = "INSERT INTO transactions_on_boxes(charges_box_id, subscription_id)VALUES(?, ?)";
  //var sql3 = "SELECT * FROM wallets WHERE company = ? ORDER BY id DESC ";

  db.query(sql1, purchaseBox, (err, result) => {
    if (err) throw err;
    db.query(sql2, subscription, (err2, result2) => {
      if (err2) throw err2;
      db.query(sql3, [result.insertId, result2.insertId], (err3, result3) => {
        if (err3) throw err3;
        res.send({
          data: 1
        })
      })
    })
  })
})


//fund wallet
app.post('/api/addReturnCardChargesWallet', jwtMiddleware, (req, res) => {
  var purchaseBox = {
    email: req.body.email,
    amount: req.body.amount / 100,
    qty: req.body.qty,
    warehouse: req.body.warehouse,
    authorization_code: req.body.authorization_code,
    bank: req.body.bank,
    card_type: req.body.card_type,
    exp_month: req.body.exp_month,
    exp_year: req.body.exp_year,
    last4: req.body.last4,
    brand: req.body.brand,
    customer_code: req.body.customer_code,
    ip_address: req.body.ip_address,
    domain: req.body.domain,
    first_name: req.body.first_name,
    last_name: req.body.last_name,
    paidAt: req.body.paidAt,
    reference: req.body.reference,
    charge_key: req.body.charge_key,
    company: req.body.company,
    wallet: req.body.wallet,
    bin: req.body.bin,
  };

  var wallet = {
    reference: req.body.reference,
    credit: req.body.amount / 100,
    date_in: req.body.paidAt,
    auth_code: req.body.authorization_code,
    card_type: req.body.card_type,
    last4: req.body.last4,
    ip_address: req.body.ip_address,
    bank: req.body.bank,
    company: req.body.company,
    bin: req.body.bin,
  };

  var sql1 = "INSERT INTO charges SET ? ";
  var sql2 = "INSERT INTO wallets SET ? ";
  var sql3 = "SELECT * FROM wallets WHERE company = ? ORDER BY id DESC ";

  db.query(sql1, purchaseBox, (err, result) => {
    if (err) throw err;
    db.query(sql2, wallet, (err2, result2) => {
      if (err2) throw err2;
      db.query(sql3, [req.body.company], (err3, result3) => {
        if (err3) throw err3;
        res.send({
          result3
        })
      })
    })
  })
})

app.post('/api/RenewFromWallet', jwtMiddleware, (req, res) => {
  var wallet = {
    reference: req.body.reference,
    debit: req.body.debit,
    date_in: req.body.date_in,
    auth_code: req.body.auth_code,
    card_type: req.body.card_type,
    ip_address: req.body.ip_address,
    bank: req.body.bank,
    company: req.body.company,
  }

  var sql1 = "UPDATE charge_boxes SET charge_key= ?, month1= ?  WHERE id = ? ";
  var sql2 = "INSERT INTO transactions_on_boxes(charges_box_id, wallet_charge_id)VALUES(?, ?)";
  var sql3 = "INSERT INTO wallets SET ? ";

  db.query(sql3, wallet, (err, result) => {
    if (err) throw err;
    db.query(sql2, [req.body.charge_id, result.insertId], (err2, result2) => {
      if (err2) throw err2;
      db.query(sql1, [req.body.reference, req.body.month1, req.body.charge_id], (err3, result3) => {
        if (err3) throw err3;
        res.send({
          data: 1
        })
      })
    })
  })


})

//update boxes or renew
app.post('/api/addReturnCardCharges2', jwtMiddleware, (req, res) => {
  var purchaseBox = {
    email: req.body.email,
    amount: req.body.amount / 100,
    qty: req.body.qty,
    warehouse: req.body.warehouse,
    authorization_code: req.body.authorization_code,
    bank: req.body.bank,
    card_type: req.body.card_type,
    exp_month: req.body.exp_month,
    exp_year: req.body.exp_year,
    last4: req.body.last4,
    brand: req.body.brand,
    customer_code: req.body.customer_code,
    ip_address: req.body.ip_address,
    domain: req.body.domain,
    first_name: req.body.first_name,
    last_name: req.body.last_name,
    paidAt: req.body.paidAt,
    reference: req.body.reference,
    charge_key: req.body.charge_key,
    company: req.body.company,
    bin: req.body.bin,
  };

  var sql1 = "INSERT INTO charges SET ? ";
  var sql2 = "UPDATE charge_boxes SET charge_key= ?, month1= ?  WHERE id = ? ";
  var sql3 = "select own_warehouses.name as warehouse, own_warehouses.location, own_warehouses.pic as warehouse_pic, own_warehouses.id as warehouse_id, boxes.boxid as bin, boxes.`name` as box, boxes.height, boxes.width, boxes.pic as box_pic, charge_boxes.cost as charge_cost, charge_boxes.date_in as started, charge_boxes.expired_date as end_date, charge_boxes.charge_box_id as box_personal_number, charges.reference, DATEDIFF(charge_boxes.expired_date, NOW()) as remain_days, charge_boxes.id as charge_id, charge_boxes.elapsed_days  from charge_boxes join own_warehouses on own_warehouses.id = charge_boxes.warehouse_id JOIN boxes on boxes.id=charge_boxes.box_id join charges on charges.charge_key = charge_boxes.charge_key where charge_boxes.company = ?  ORDER BY charge_boxes.elapsed_days ";
  var sqlMe = "INSERT INTO transactions_on_boxes(charges_box_id, charges_id)VALUES(?, ?)";
  db.query(sql1, purchaseBox, (err, result4) => {
    if (err) throw err;
    db.query(sql2, [req.body.charge_key, req.body.month1, req.body.charge_id], (err2, result2) => {
      if (err2) throw err2;
      db.query(sqlMe, [req.body.charge_id, result4.insertId], (err5, result5) => {
        if (err5) throw err5;
        db.query(sql3, [req.body.company], (err3, result) => {
          if (err3) throw err3;
          res.send({
            result
          });
        });
      })

    });
  });

});


//add return charges
app.post('/api/addReturnCardCharges', jwtMiddleware, (req, res) => {
  var purchaseBox = {
    email: req.body.email,
    amount: req.body.amount / 100,
    qty: req.body.qty,
    warehouse: req.body.warehouse,
    authorization_code: req.body.authorization_code,
    bank: req.body.bank,
    card_type: req.body.card_type,
    exp_month: req.body.exp_month,
    exp_year: req.body.exp_year,
    last4: req.body.last4,
    brand: req.body.brand,
    customer_code: req.body.customer_code,
    ip_address: req.body.ip_address,
    domain: req.body.domain,
    first_name: req.body.first_name,
    last_name: req.body.last_name,
    paidAt: req.body.paidAt,
    reference: req.body.reference,
    charge_key: req.body.charge_key,
    company: req.body.company,
    bin: req.body.bin,
  };

  var sql1 = "INSERT INTO charges SET ? ";
  var sql2 = "INSERT INTO charge_boxes SET ? ";
  db.query(sql1, purchaseBox, (err, result) => {
    if (err) throw err;
    req.body.box.forEach(element => {
      db.query(sql2, element, (err2, result2) => {
        if (err2) throw err2;
        //insert
        var sqlMe = "INSERT INTO transactions_on_boxes(charges_box_id, charges_id)VALUES(?, ?)";
        db.query(sqlMe, [result2.insertId, result.insertId], (err4, result4) => {
          if (err4) throw err4;
        })
      });
    });
    res.send({
      data: 1
    })
  })

});

//get boxes
app.get('/api/getBoxesAsPerWarehouse/:warehouse_id', jwtMiddleware, (req, res) => {
  var sql = "select * from boxes where boxes.warehouse = ?"
  db.query(sql, [req.params.warehouse_id], (err, result) => {
    if (err) throw err;
    // console.log(result);
    res.send({
      result
    })
  })
})

//get the company selected warehouses
app.get('/api/getSelectedWarehouses2/:company', jwtMiddleware, (req, res) => {
  var sql = "select `name`, own_warehouses.id, location, remarks, pic from selected_warehouses JOIN own_warehouses on own_warehouses.id = selected_warehouses.warehouse  where selected_warehouses.company= ? ";
  db.query(sql, [req.params.company], (err, result) => {
    if (err) throw err;
    res.send({
      result
    })
  })
})

//list box
app.get('/api/boxList', jwtMiddleware, (req, res) => {
  var sql = 'select * from boxes';
  db.query(sql, (err, result) => {
    if (err) throw err;
    res.send({
      result
    })
  })
});

//get warehouse list as regards to user selected warehouse
app.get(
  "/api/getWarehouseList/:company/:warehouseChoice",
  jwtMiddleware,
  (req, res) => {
    if (req.params.warehouseChoice == 1) {
      //select company warehouse...
      var sql =
        "select own_warehouses.lat, own_warehouses.log, own_warehouses.`name`, own_warehouses.location, own_warehouses.remarks, own_warehouses.id, own_warehouses.pic from selected_warehouses JOIN own_warehouses on own_warehouses.id=selected_warehouses.warehouse where selected_warehouses.company= ?";
    } else {
      //select user warehouse....
      var sql = "select * from warehouses where company = ?";
    }
    db.query(sql, [req.params.company], (err, result) => {
      if (err) throw err;
      res.send({
        result
      })
    });
  }
);

//get selected warehouses
app.get("/api/getSelectedWarehouses/:company", jwtMiddleware, (req, res) => {
  var sql = "SELECT * FROM selected_warehouses WHERE company = ?";
  db.query(sql, [req.params.company], (err, result) => {
    if (err) throw err;
    res.send({
      result
    });
  });
});

//opt in for warehouses
app.get(
  "/api/optForWarehouse/:warehouse/:company",
  jwtMiddleware,
  (req, res) => {
    var warehouse = {
      warehouse: req.params.warehouse,
      company: req.params.company
    };
    sql = "INSERT INTO selected_warehouses SET ? ";
    db.query(sql, warehouse, (err, result) => {
      if (err) throw err;
      //select new warehouse
      res.send({
        data: 1
      });
    });
  }
);

//get chart data for warehouse
app.get("/api/getChartData", jwtMiddleware, (req, res) => {
  var sql =
    "select sum(if(choice=1,1,0))as total_in,sum(if(choice=0,1,0))as total_out from mywarehouse_choices";
  db.query(sql, (err, result) => {
    if (err) throw err;
    res.send({
      result
    });
  });
});

// get the list of warehouses
app.get("/api/getWarehouses/:company", jwtMiddleware, (req, res) => {
  var sql =
    "select * from own_warehouses where id not in (select selected_warehouses.warehouse from selected_warehouses where company= ? ) ";
  db.query(sql, req.params.company, (err, result) => {
    if (err) throw err;
    res.send({
      result
    });
  });
});

//choose warehouse
app.get("/api/selectWarehouse/:choice/:company", jwtMiddleware, (req, res) => {
  var sql = "INSERT INTO mywarehouse_choices SET ? ";
  var choice = {
    choice: req.params.choice,
    company: req.params.company
  };
  if (req.params.choice == 1) {
    //company warehouse
    db.query(sql, choice, (err, result) => {
      if (err) throw err;
      res.send({
        data: 1
      });
    });
  } else {
    // user warehouse
    db.query(sql, choice, (err, result) => {
      if (err) throw err;
      res.send({
        data: 0
      });
    });
  }
});

//checkUserExist
app.get("/api/userExist/:email", (req, res) => {
  let sql = "select * from users where email= ?";
  db.query(sql, [req.params.email], (err, result) => {
    if (err) throw err;
    res.send({
      result
    });
  });
});

//signup
app.post("/api/signUp", (req, res) => {
  const data = req.body;
  let user = {
    name: data.name,
    email: data.email,
    password: null,
    company: null,
    role: null
  };
  const company = {
    name: data.company,
    email: data.email
  };
  const role = {
    name: "Administrator"
  };
  const company_sql = "INSERT INTO companies SET ?";
  const role_sql = "INSERT INTO roles SET ?";
  const sql = "INSERT INTO users SET ?";

  db.query(company_sql, company, (err3, result) => {
    if (err3) throw err3;
    user.company = result.insertId;
    db.query(role_sql, role, (err2, result) => {
      if (err2) throw err2
      user.role = result.insertId;
      user.password = data.password;
        //do some validation here
        const schema = Joi.object().keys({
          email: Joi.string()
            .email()
            .required(),
          name: Joi.string().required(),
          password: Joi.string().required(),
          company: Joi.number().required(),
          role: Joi.number().required()
        });
        Joi.validate(user, schema, (err, value) => {
          if (err) {
            res.send({
              err
            });
          } else {
            db.query(sql, user, (err, result) => {
              if (err) errorMessage(err, res);
              const token = jwt.sign(user, SECRET);
              res.status(200).send({
                name: data.name,
                email: data.email,
                company: user.company,
                token: token
              });
            });
          }
        });
    

    });
  });



});

// get user warehouse choice
app.get("/api/getUserChoices/:company", jwtMiddleware, (req, res) => {
  var sql = "SELECT * FROM mywarehouse_choices where company= ? limit 1";
  db.query(sql, [req.params.company], (err, result) => {
    if (err) throw err;
    choice = result[0];
    res.send({
      choice
    });
  });
});

app.post("/api/login", (req, res) => {
  const data = req.body;
  var sql = "SELECT * FROM users where email= ? limit 1";
  db.query(sql, [data.email], (err, user) => {
    if (err) throw err;
    if (user[0] == null) {
      res.send({
        message: 'Email not found, please try again !'
      })
    } else {
      var name = user[0].name;
      var email = user[0].email;
      var company = user[0].company;
      var password = user[0].password;

      //var decrypted_password = decrypt(password);
        if (data.password !== password) {
          res.send({
            message: "Wrong Password !, Please try again !"
          });
        }else {
          const token = jwt.sign(password, SECRET);
          res.send({
            name: name,
            email: email,
            company: company,
            token: token
          });
        }
    
    }

  });
});




module.exports = app;