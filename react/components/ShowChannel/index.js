import { connect } from 'react-redux';
import View from './view';

const mapStateToProps = ({ show }) => {
  // select request info
  const requestId = show.request.id;
  // select request
  const previousRequest = show.previousRequests[requestId] || null;
  // select channel
  let channel;
  if (previousRequest) {
    const channelKey = previousRequest.key;
    channel = show.channelList[channelKey] || null;
  }
  return {
    channel,
  };
};

export default connect(mapStateToProps, null)(View);
