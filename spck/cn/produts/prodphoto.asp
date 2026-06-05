<% data_path="../../../" 'ACC连接数据库路径，对SQL无效 %>
<!--#include file="../../../conn/conn.asp"-->
<!--#include file="../../../inc/filesystem.asp"-->
<!--#include file="../../../inc/safe.asp"-->
<%
if request.Cookies("masterflag")="" or request.Cookies("masterflag")="" then
	response.write "<script language='javascript'>"
	response.write"parent.location.href='../../login.asp';</SCRIPT>" 
	response.end
end if
 
'权限限制^^^^^^^^^^^^^^^^^^^^
 dim ishavegant
 ishavegant=false
 in_str=split(request.Cookies("masterflag"),",")
 for each ins in in_str
 	if trim(ins)="06" then 
 		ishavegant=true
 	end if
 next 
 if ishavegant=false then
	 response.redirect "../../err.asp"
 	response.end
 end if
 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^End
if request.QueryString("action")="del" then
	if not isempty(request("selAnnounce")) then
		newsidlist=request("selAnnounce")
		if instr(newsidlist,",")>0 then
			dim newsidarr
			newsidArr=split(newsidlist)
			dim log_newsid
			for i = 0 to ubound(newsidarr)
				log_newsid=clng(newsidarr(i))
				call deleteannounce(log_newsid)
			next
		else
			call deleteannounce(clng(newsidlist))
		end if
	end if
end if
 %>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<LINK href="../../css/style.css" rel=stylesheet type=text/css> 
<SCRIPT language=javascript1.2 src="../../css/iXs_Main.js"></SCRIPT>
<script>
var checkflag="false";
function check(field){
if(checkflag=="false"){
for(i=0;i<field.length;i++){
field[i].checked=true;}
checkflag="true";
return "解除全选"; }
else {
for(i=0;i<field.length;i++) {
field[i].checked=false;}
checkflag="false";
return "选择全部";}}
</script>


<table width="98%" border="0" cellspacing="0" cellpadding="0" align=center class="tableBorder"> 
  <tr> 
     <th height=25 colspan="2" class="tableHeaderText">产品图片</th> 
  </tr> 
  <tr> 
     <td colspan="2" class="forumRowHighlight"><p><B>注意</B>：<BR> 
         ①产品图片直接与发布的信息相关联，删除类别可能会影响到以前发布的产品信息。<BR> </td> 
  </tr> 
  
  <tr>
    <td width="19%" height=25 class="forumRowHighlight">&nbsp;</td>
	 <td width="81%" class="forumRowHighlight"><a href="prod.asp">管理产品</a> | <a href="prod_add.asp">添加产品</a> | <a href="prodcat.asp">管理类别</a> | <a href="prodcat_add.asp">添加类别</a> | <a href="prodphoto.asp">图片管理</a> | <a href="prodphoto_add.asp">添加图片</a> | [<a href="javascript:location.reload()">刷新页面</a>] </td> 
  </tr> 
</table>


<Form name="search" method="POST" action="prodphoto.asp?action=del">
  <table wnewsidth="100%" border="0" align="center" cellpadding="2" cellspacing="1" class="tableBorder">
    <tr>
      <th class="tableHeaderText" height=25 colspan="3">产品图片列表</th>
    <tr>
      <td colspan="3">      </td>
    </tr>
    <tr height=25 class=bodytitle>
      <td width="46%" align="left" class=bodytitle wnewsidth="446"><font color="ff6600"><b>图片名称</b></font></td>
      <td width="28%" align="center" class=bodytitle wnewsidth="113"><font color="ff6600"><b>上传时间</b></font></td>
      <td width="26%" align="center" class=bodytitle wnewsidth="57"><input name="submit2" type='submit' value='删除'></td>
    </tr>
    <%
	Sql="Select * from benming_ch_prodphoto order by date desc"
	set Rs=server.CreateObject("ADODB.Recordset")
	Rs.open Sql,conn,1,1
	msg_per_page=10
	%>
	<!--#include file="../../../inc/Headpage.asp"-->
	<%
	
	j=1
	do while not rs.eof and rowcount > 0
 
	%>
    <tr height="20">
      <td align="left" class=forumRow> &nbsp;
	<%
	Response.write Rs("photoName")
	%>
	

		<img src="../../images/haveimg.gif" alt="此条信息为图片标题：&lt;br&gt;&lt;img src=<%=Rs("photopic")%> border=1 width=220 height=150&gt;" width="12" height="12" border="0">	   	</td>
      	<td wnewsidth="113" align="center" class=forumRow><%=Rs("date")%></td>
      	<td wnewsidth="57" align="center" class=forumRow><input type='checkbox' name='selAnnounce' value='<%=Rs("id")%>'></td>
    </tr>
	 <%
		rowcount=rowcount-1
		rs.movenext
		j=j+1
	loop

	%> 
	<tr height="20" bgcolor="#ffffff">
      <td  class=forumRow align="right">&nbsp;</td>
      <td  class=forumRow align="right">&nbsp;</td>
      <td  class=forumRow align="right"><div align="center">
        <input name="button" type=button onClick="this.value=check(this.form)" value=" 全部选定 ">
      </div></td>
	</tr>
    <tr height="20" bgcolor="#ffffff">
      <td class=forumrowHighLight align="center" colspan="3"><%=listPages("prodphoto.asp")%></td>
    </tr>
  </table>
</form>
  <%
  	Rs.close
	Set Rs=nothing
  '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^分类名称
	Function GetCatName(id)
  		Sql="Select CatName From benming_ch_NewsCat where id="&id
		Set Rstype=Server.CreateObject("ADODB.RecordSet")
		Rstype.open Sql,Conn,1,1
		if Rstype.eof=False and Rstype.bof=False then
			GetCatName=Rstype("CatName")
		else
			GetCatName=""
		end if
		Rstype.close
		Set Rstype=nothing
  	End function
  
  '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^删除产品图片
	sub deleteannounce(id)
		dim rs,sql, RsInfo
		Set RsINfo=Conn.Execute("Select * From benming_ch_prodphoto Where id="&id&" ")
		if NOt RsINfo.Eof Then
			ttid=RsINfo("id")
			Picture=RsInfo("photopic")
			FileName=Picture
			if FileName<>"" then
				Call FileDel(FileName) '删除图片文件
			end if
			
		End if
		RsInFo.Close
		Set RsInfo=NOthing
		set rs=server.createobject("adodb.recordset")
		sql="delete from [benming_ch_prodphoto] where id="&cstr(id)
		conn.execute sql
		if err.Number<>0 then
			err.clear
			response.write "删 除 失 败 !<br>"
		end if
End sub
  
  Conn.close
  Set Conn=nothing
  %>