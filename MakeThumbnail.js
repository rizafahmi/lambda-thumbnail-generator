const async = require('steed')
const AWS = require('aws-sdk')
const gm = require('gm')
.subClass({ imageMagick: true })
const util = require('util')

const MAX_WIDTH = 100
const MAX_HEIGHT = 100

const s3 = new AWS.S3()

exports.handler = function (event, context) {
  console.log('Reading options from event:\n', util.inspect(event, {depth: 5}))
  const srcBucket = event.Records[0].s3.bucket.name
  const srcKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '))
  const dstBucket = srcBucket + '-thumbnail'
  const dstKey = 'thumbnail-' + srcKey

  if (srcBucket === dstBucket) {
    console.error('Destination bucket must not match source bucket.')
    return
  }

  const typeMatch = srcKey.match(/\.([^.]*)$/)
  if (!typeMatch) {
    console.error('unable to infer image type for key ' + srcKey)
  }
  const imageType = typeMatch[1]
  if (imageType !== 'jpg' && imageType != 'png') {
    console.log('Skipping non-image ' + srcKey)
    return
  }

  async.waterfall([
    function download (next) {
      s3.getObject({
        Bucket: srcBucket,
        Key: srcKey
      }, next)
    },
    function transform (response, next) {
      gm(response.Body).size(function (err, size) {
        const scalingFactor = Math.min(
          MAX_WIDTH / size.width,
          MAX_HEIGHT / size.height
        )
        const width = scalingFactor * size.width
        const height = scalingFactor * size.height

        this.resize(width, height)
          .toBuffer(imageType, function (err, buffer) {
            if (err) {
              next(err)
            } else {
              next(null, response.ContentType, buffer)
            }
          })
      })
    },
    function upload (contentType, data, next) {
      s3.putObject({
        Bucket: dstBucket,
        Key: dstKey,
        Body: data,
        ContentType: contentType
      }, next)
    }
  ], function (err) {
    if (err) {
      console.error('Unable to reisze ' + srcBucket + '/' + srcKey + ' and upload to ' + dstBucket + '/' + dstKey + ' due to an error: ' + err
      )
    } else {
      console.log('Successfully resized ' + srcBucket + '/' + srcKey + ' and uploaded to ' + dstBucket + '/' + dstKey)
    }
  })
}
