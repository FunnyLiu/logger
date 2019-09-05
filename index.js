
/**
 * Module dependencies.
 */
'use strict'

const Counter = require('passthrough-counter')
const humanize = require('humanize-number')
const bytes = require('bytes')
const chalk = require('chalk')
const util = require('util')

/**
 * Expose logger.
 */

module.exports = dev

/**
 * Color map.
 */

const colorCodes = {
  7: 'magenta',
  5: 'red',
  4: 'yellow',
  3: 'cyan',
  2: 'green',
  1: 'green',
  0: 'yellow'
}

/**
 * Development logger.
 */

function dev (opts) {
  // print to console helper.
  // 立即执行该函数
  const print = (function () {
    let transporter
    // 设置自定义转换输出器
    // 同时支持函数格式和对象格式
    if (typeof opts === 'function') {
      transporter = opts
    } else if (opts && opts.transporter) {
      transporter = opts.transporter
    }
    // 输出，通过自定义输出流函数或者console.log
    return function printFunc (...args) {
      const str = util.format(...args)
      if (transporter) {
        transporter(str, args)
      } else {
        console.log(...args)
      }
    }
  }())
  // 返回的中间件函数
  return async function logger (ctx, next) {
    // request
    // 通过Symbol.for获取私有变量或当前时间
    const start = ctx[Symbol.for('request-received.startTime')] ? ctx[Symbol.for('request-received.startTime')].getTime() : Date.now()
    // <--代表请求开始
    print('  ' + chalk.gray('<--') +
      ' ' + chalk.bold('%s') +
      ' ' + chalk.gray('%s'),
    ctx.method,
    ctx.originalUrl)

    try {
      // 执行下一中间件
      await next()
    } catch (err) {
      // log uncaught downstream errors
      log(print, ctx, start, null, err)
      throw err
    }
    // 接下来为后置操作
    // calculate the length of a streaming response
    // by intercepting the stream with a counter.
    // only necessary if a content-length header is currently not set.
    const length = ctx.response.length
    const body = ctx.body
    let counter
    if (length == null && body && body.readable) {
      ctx.body = body
        .pipe(counter = Counter())
        .on('error', ctx.onerror)
    }

    // log when the response is finished or closed,
    // whichever happens first.
    const res = ctx.res

    const onfinish = done.bind(null, 'finish')
    const onclose = done.bind(null, 'close')
    // 通过http.ServerResponse的finish和close事件判断响应结束
    res.once('finish', onfinish)
    res.once('close', onclose)
    // 完成后执行log函数
    function done (event) {
      res.removeListener('finish', onfinish)
      res.removeListener('close', onclose)
      log(print, ctx, start, counter ? counter.length : length, null, event)
    }
  }
}

/**
 * Log helper.
 */
// 格式化日志内容
function log (print, ctx, start, len, err, event) {
  // get the status code of the response
  const status = err
    ? (err.isBoom ? err.output.statusCode : err.status || 500)
    : (ctx.status || 404)

  // set the color of the status code;
  const s = status / 100 | 0
  // eslint-disable-next-line
  const color = colorCodes.hasOwnProperty(s) ? colorCodes[s] : colorCodes[0]

  // get the human readable response length
  let length
  if (~[204, 205, 304].indexOf(status)) {
    length = ''
  } else if (len == null) {
    length = '-'
  } else {
    length = bytes(len).toLowerCase()
  }
  // -->代表响应结束
  const upstream = err ? chalk.red('xxx')
    : event === 'close' ? chalk.yellow('-x-')
      : chalk.gray('-->')

  print('  ' + upstream +
    ' ' + chalk.bold('%s') +
    ' ' + chalk.gray('%s') +
    ' ' + chalk[color]('%s') +
    ' ' + chalk.gray('%s') +
    ' ' + chalk.gray('%s'),
  ctx.method,
  ctx.originalUrl,
  status,
  time(start),
  length)
}

/**
 * Show the response time in a human readable format.
 * In milliseconds if less than 10 seconds,
 * in seconds otherwise.
 */
// 友好处理时间格式
function time (start) {
  const delta = Date.now() - start
  return humanize(delta < 10000
    ? delta + 'ms'
    : Math.round(delta / 1000) + 's')
}
