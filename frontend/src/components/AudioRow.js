"use client";

import { faVolumeHigh, faVolumeLow, faVolumeXmark } from "@fortawesome/free-solid-svg-icons";
import useRemote from "../lib/useRemote";
import RemoteButton from "./RemoteButton";

// One audio row for the app pages: the laptop's system volume on the outside,
// the app's own player volume inside, and the system mute in the middle.
export default function AudioRow({ appLabel, onAppUp, onAppDown }) {
  const { action } = useRemote("laptop", { poll: false });
  return (
    <div className="row five">
      <RemoteButton icon={faVolumeHigh} label="PC +" onPress={() => action("volumeUp")} />
      <RemoteButton icon={faVolumeHigh} label={`${appLabel} +`} onPress={onAppUp} />
      <RemoteButton icon={faVolumeXmark} label="PC Mute" onPress={() => action("mute")} />
      <RemoteButton icon={faVolumeLow} label={`${appLabel} -`} onPress={onAppDown} />
      <RemoteButton icon={faVolumeLow} label="PC -" onPress={() => action("volumeDown")} />
    </div>
  );
}
