const logger = require('winston');
const db = require('server/models');
const { publishClaim } = require('server/lbrynet');
const { createFileRecordDataAfterPublish } = require('server/models/utils/createFileRecordData.js');
const {
  createClaimRecordDataAfterPublish,
} = require('server/models/utils/createClaimRecordData.js');
const deleteFile = require('./deleteFile.js');

const publish = async (publishParams, fileName, fileType) => {
  let publishResults;
  let channel;
  let fileRecord;
  let newFile = Boolean(publishParams.file_path);

  try {
    publishResults = await publishClaim(publishParams);
    logger.verbose(`Successfully published ${publishParams.name} ${fileName}`, publishResults);
    const outpoint = `${publishResults.output.txid}:${publishResults.output.nout}`;
    // get the channel information
    if (publishParams.channel_name) {
      logger.debug(`this claim was published in channel: ${publishParams.channel_name}`);
      channel = await db.Channel.findOne({
        where: {
          channelName: publishParams.channel_name,
        },
      });
    } else {
      channel = null;
    }
    const certificateId = channel ? channel.channelClaimId : null;
    const channelName = channel ? channel.channelName : null;

    const claimRecord = await createClaimRecordDataAfterPublish(
      certificateId,
      channelName,
      fileName,
      fileType,
      publishParams,
      publishResults
    );
    const { claimId } = claimRecord;
    const upsertCriteria = { name: publishParams.name, claimId };
    if (newFile) {
      // this is the problem
      //
      fileRecord = await createFileRecordDataAfterPublish(
        fileName,
        fileType,
        publishParams,
        publishResults
      );
    } else {
      fileRecord = await db.File.findOne({ where: { claimId } }).then(result => result.dataValues);
    }

    const [file, claim] = await Promise.all([
      db.upsert(db.File, fileRecord, upsertCriteria, 'File'),
      db.upsert(db.Claim, claimRecord, upsertCriteria, 'Claim'),
    ]);
    logger.debug(`File and Claim records successfully created (${publishParams.name})`);

    await Promise.all([file.setClaim(claim), claim.setFile(file)]);
    logger.debug(`File and Claim records successfully associated (${publishParams.name})`);

    return Object.assign({}, claimRecord, { outpoint });
  } catch (err) {
    // parse daemon response when err is a string
    // this needs work
    logger.error('publish/publish err:', err);
    const error = typeof err === 'string' ? JSON.parse(err) : err;
    if (publishParams.file_path) {
      await deleteFile(publishParams.file_path);
    }
    const message =
      error.error && error.error.message ? error.error.message : 'Unknown publish error';
    return {
      error: true,
      message,
    };
  }
};

module.exports = publish;
