var express = require('express')
var router = express.Router()
var path = require('path')
var fs = require('fs')
var mercator = new(require("@mapbox/sphericalmercator"))()

var minZoom = 0
var maxZoom = 22
var tilePathFormat = "/{z}/{x}/{y}.{format}"
var SCALE_PATTERN = "@[23]x"
var tilePattern = tilePathFormat
  .replace(/\.(?!.*\.)/, ":scale(" + SCALE_PATTERN + ")?.")
  .replace(/\./g, "\.")
  .replace("{z}", ":z(\\d+)")
  .replace("{x}", ":x(\\d+)")
  .replace("{y}", ":y(\\d+)")
  .replace("{format}", ":format([\\w\\.]+)")

router.get('/test', function(req, res) {
  console.log("test")
  res.send("tt")
})

/**
 * 加载单个tilejson文件
 */
router.get('/tilejson.json', function (req, res) {
  console.log("tilejson")
  var tilejsonPath = path.resolve(__dirname, '../map_mvt/tilejson/tilejson.json')
  var tileInfo = require(tilejsonPath)
  var protocol = req.protocol
  var host = req.headers.host
  var mvtPath = (path.dirname(req.originalUrl) + tilePathFormat.replace("{format}", tileInfo.format)).replace(/\/+/g, "/")
  var url = protocol + "://" + host + mvtPath
  tileInfo.tiles = [url]    // 设置请求切片的路径, 重要！！！ tilejson中需要tiles的地址信息http://localhost:3002/{z}/{x}/{y}.pbf
  tileInfo.tilejson = "2.0.0"
  minZoom = tileInfo.minzoom || 0
  maxZoom = tileInfo.maxZoom || 22
  res.set({
    tileJSON: true,
    200: true
  })
  return res.send(tileInfo)
})

/**
 * 加载多个tilejson（tilejson目录下有多个tilejson文件）
 */
router.get('/tilejson', function (req, res) {
  var tilejsonPath = path.resolve(__dirname, '../map_mvt/tilejson/tilejson')
  var stats = fs.statSync(tilejsonPath)
  var tileInfo = {}
  if (stats.isDirectory()) {
    tileInfo = fs.readdirSync(tilejsonPath).filter(function (filename) {
      return path.extname(filename) === ".json"
    }).reduce(function (config, filename) {
      var localConfig = require(path.join(tilejsonPath, filename))
      return Object.keys(localConfig).reduce(function (config, k) {
        config[k] = localConfig[k]
        return config
      }, config)
    }, tileInfo)
  }
  var protocal = req.header['x-forwarded-proto'] || req.protocal
  var host = req.headers['x-forwarded-host'] || req.headers.host
  var mvtPath = (path.dirname(req.originalUrl) + tilePathFormat.replace("{format}", tileInfo.format)).replace(/\/+/g, "/")
  var url = protocal + "://" + host + mvtPath

  tileInfo.tiles = [url]
  tileInfo.tilejson = "2.0.0"
  minZoom = tileInfo.minzoom || 0
  maxZoom = tileInfo.maxZoom || 22
  res.set({
    tileJSON: true,
    200: true
  })
  return res.send(tileInfo)
})

/**
 * 地图切片路由
 */
router.get(tilePattern, function(req, res, next) {
  var z = req.params.z || 0
  var x = req.params.x || 0
  var y = req.params.y || 0

  return getTile(z, x, y, function(err, data, headers) {
    if(err) {
      next(err)
    }
    if(data == null) {
      res.status(404).send('Not Found')
    } else {
      res.set(headers)
      return res.status(200).send(data)
    }
  })

})

/**
 * 解析单个地图瓦片
 */
function getTile(z, x, y, callback) {
  // validate zoom
  if(z < minZoom || z > maxZoom) {
    console.log("Invalid Zoom:", z)
    return callback(null, null, {
      404: true,
      invalidZoom: true
    })
  }
  // validate coords against bounds
  var xyz = mercator.xyz([-180, -89.99999999990001, 180.00000000010004, 83.60415649412698], z)
  if(x < xyz.minX || x > xyz.maxX || y < xyz.mixY || y > xyz.maxY) {
    console.log("Invalid coordinates: %d %d relative to bounds:", x, y, xyz)
    return callback(null, null, {
      404: true,
      invalidCoordinates: true
    })
  }
  var tileName = 'jdmap' + '.' + z + '.' + x + '.' + y + '.vector.mvt'
  var mvtUrl = path.resolve(__dirname, '../map_mvt/vectortile', tileName) // 瓦片的路径
  fs.readFile(mvtUrl, function(err, data) {
    if (err) {
      console.log("err: ", err)
      if (err.message.match(/(Tile|Grid) does not exist/)) {
        return callback(null, null,{
          404: true
        })
      }
      return callback(err)
    }

    if (data === null || data === undefined) {
      return callback(null, null,{
        404: true
      })
    }
    var headers = {}
    // work-around for PBF MBTiles that don't contain appropriate headers
    headers["content-type"] = headers["content-type"] || "application/x-protobuf";
    headers["content-encoding"] = headers["content-encoding"] || "gzip";
    return callback(null, data, headers);
  });
}

module.exports = router