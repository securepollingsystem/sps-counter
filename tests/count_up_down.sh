COUNTER_URL=http://localhost:8994/
CENTRAL_SERVER_URL=http://localhost:8994/
UPDATE_WAIT_TIME=3 # number of seconds to wait for updateOpinionCounts
curl -s "${COUNTER_URL}opinions?subset=Hello%20World" | grep '"id":52,"opinion":"Hello world",' | grep --colour=always 'screed_count":.*,' # check Hello World
# add Hello World
curl -s ${CENTRAL_SERVER_URL}upload-screed -X POST -H "Content-Type: application/json" -d '{"screed":"[\"Hello world\"]","signature":"XkUAbDic2w_pm6WHY_Kt58ur5l0R9tmul6g7xv1G9y0DJ-ZJX7QDcJfBaK3Slv3C-A6L93KO5fHdctj1xRaWBw","publicKey":"69bad4c7f8d088a20dd2cacf7484693cec675350791771a975f1f6b892e6cc1b"}'
echo done; sleep $UPDATE_WAIT_TIME # wait for updateOpinionCounts
curl -s "${COUNTER_URL}opinions?subset=Hello%20World" | grep '"id":52,"opinion":"Hello world",' | grep --colour=always 'screed_count":.*,' # check Hello World
# remove Hello World
curl -s ${CENTRAL_SERVER_URL}upload-screed -X POST -H "Content-Type: application/json" -d '{"screed":"[]","signature":"yt2vPNZNpyD7K0yPrKBG0vgJIJbpmGYZTRu0t-OWrlIs15J5iylBb-iB3HYLZ8FvVn2APyxIE3RriqI_CCcSAQ","publicKey":"69bad4c7f8d088a20dd2cacf7484693cec675350791771a975f1f6b892e6cc1b"}'
echo done; sleep $UPDATE_WAIT_TIME # wait for updateOpinionCounts
curl -s "${COUNTER_URL}opinions?subset=Hello%20World" | grep '"id":52,"opinion":"Hello world",' | grep --colour=always 'screed_count":.*,' # check Hello World
